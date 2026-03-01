import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ApifyWebhookPayload {
    userId?: string;
    createdAt?: string;
    eventType: string;
    eventData?: {
        actorId: string;
        actorRunId: string;
    };
    resource: {
        id: string;
        actId: string;
        status: string;
        defaultDatasetId: string;
    };
}

interface PlaceData {
    title?: string;
    name?: string;
    phoneUnformatted?: string;
    phone?: string;
    website?: string;
    url?: string;
    address?: string;
    street?: string;
    reviewsCount?: number;
    location?: { lat: number, lng: number };
    imageUrl?: string;
    totalScore?: number;
    categoryName?: string;
    neighborhood?: string;
}

interface LeadInsert {
    user_id: string;
    company_name: string;
    address: string;
    phone: string | null;
    website: string | null;
    no_website: boolean;
    reviews_count: number;
    latitude: number | null;
    longitude: number | null;
    ai_score: number;
    ai_reason: string;
    status: string;
    image_url: string | null;
    google_score: number | null;
    category_name: string | null;
    neighborhood: string | null;
}

serve(async (req) => {
    // Resposta Preflight (CORS)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)
        const keyword = url.searchParams.get('keyword')
        const region = url.searchParams.get('region')
        const userId = url.searchParams.get('user_id')

        if (!keyword || !region || !userId) {
            throw new Error('Faltam parâmetros na URL (keyword, region, user_id).')
        }

        const payload: ApifyWebhookPayload = await req.json()

        // Ignora se não for evento de sucesso
        if (payload.eventType !== 'ACTOR.RUN.SUCCEEDED' || payload.resource.status !== 'SUCCEEDED') {
            return new Response(JSON.stringify({ message: 'Run not succeeded or unsupported event.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            })
        }

        const datasetId = payload.resource.defaultDatasetId
        if (!datasetId) {
            throw new Error('Dataset ID não encontrado no payload do webhook.')
        }

        // 1. Buscar dados do dataset no Apify
        const apifyToken = Deno.env.get('APIFY_API_TOKEN')
        const datasetResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}`)

        if (!datasetResponse.ok) {
            throw new Error(`Erro ao buscar dados do Apify: ${datasetResponse.statusText}`)
        }

        const items: PlaceData[] = await datasetResponse.json()

        if (!items || items.length === 0) {
            return new Response(JSON.stringify({ message: 'Nenhum lead encontrado no dataset do Apify.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            })
        }

        const openAiKey = Deno.env.get('OPENAI_API_KEY')
        const leadsToInsert: LeadInsert[] = []

        // 2. Mapear os dados e avaliar cada lead com a OpenAI
        for (const item of items) {
            const nome = item.title || item.name || 'Sem Nome'
            const telefone = item.phoneUnformatted || item.phone || null
            const siteUrl = item.website || item.url || null
            const endereco = item.address || item.street || 'Endereço não informado'
            const reviewsCount = item.reviewsCount || 0
            const lat = item.location?.lat || null
            const lng = item.location?.lng || null
            const imageUrl = item.imageUrl || null
            const googleScore = item.totalScore || null
            const categoryName = item.categoryName || null
            const neighborhood = item.neighborhood || null

            const promptData = { nome, telefone, site: siteUrl, endereco, reviewsCount }

            const openAiPayload = {
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "Você é um avaliador de leads B2B especialista. Sua função é receber dados de um estabelecimento e avaliar se ele é um bom match com a região e o nicho (keyword) buscados. Retorne estritamente um JSON com duas chaves: 'ai_score' (número de 0 a 100) e 'ai_reason' (string com uma breve justificativa de no máximo 2 frases do motivo da nota)."
                    },
                    {
                        role: "user",
                        content: `Nicho buscado: "${keyword}"\nRegião buscada: "${region}"\n\nDados do lead coletados: ${JSON.stringify(promptData)}`
                    }
                ],
                response_format: { type: "json_object" }
            }

            let ai_score = 50
            let ai_reason = "Avaliação pendente devido a erro na IA"

            try {
                const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${openAiKey}`
                    },
                    body: JSON.stringify(openAiPayload)
                })

                if (aiResponse.ok) {
                    const aiResult = await aiResponse.json()
                    const parsedContent = JSON.parse(aiResult.choices[0].message.content)

                    ai_score = typeof parsedContent.ai_score === 'number'
                        ? parsedContent.ai_score
                        : (parseInt(parsedContent.ai_score) || 50)
                    ai_reason = parsedContent.ai_reason || ai_reason
                } else {
                    console.error("Erro na resposta da OpenAI:", await aiResponse.text())
                }
            } catch (e) {
                console.error("Falha ao se comunicar com a OpenAI ou fazer parse do JSON:", e)
            }

            // Popula o array de leads para inserção
            leadsToInsert.push({
                user_id: userId,
                company_name: nome,
                address: endereco,
                phone: telefone,
                website: siteUrl,
                no_website: siteUrl ? false : true,
                reviews_count: reviewsCount,
                latitude: lat,
                longitude: lng,
                ai_score: ai_score,
                ai_reason: ai_reason,
                status: 'Novos Leads', // Status padrão do pipeline Kanban
                image_url: imageUrl,
                google_score: googleScore,
                category_name: categoryName,
                neighborhood: neighborhood
            })
        }

        // 3. Salvar os resultados na tabela 'leads' do Supabase usando Service Role
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { error: insertError } = await supabaseClient
            .from('leads')
            .insert(leadsToInsert)

        if (insertError) {
            throw new Error(`Erro ao salvar leads no banco do Supabase: ${insertError.message}`)
        }

        return new Response(JSON.stringify({ success: true, count: leadsToInsert.length }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido"
        return new Response(JSON.stringify({ error: errorMessage }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
