import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Resposta Preflight (CORS)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body = await req.json()
        const { leadVolume, region, keywords, isPremium } = body

        // Custos
        const costPerLead = isPremium ? 3 : 1
        const totalCost = leadVolume * costPerLead

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('O Front-end não enviou o header de Authorization.')
        }

        const token = authHeader.replace('Bearer ', '').trim()

        // Conecta no Supabase, passando o token globalmente para o RLS funcionar no banco
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        // Valida o usuário com o token extraído
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

        if (authError || !user) {
            throw new Error(`Token inválido ou expirado: ${authError?.message}`)
        }

        // Verifica o Saldo na tabela pública
        const { data: userData, error: userError } = await supabaseClient
            .from('users')
            .select('credits_balance')
            .eq('id', user.id)
            .single()

        if (userError) {
            throw new Error(`Erro ao buscar saldo no banco: ${userError.message}`)
        }
        if (!userData) {
            throw new Error(`Usuário não encontrado na tabela public.users.`)
        }

        // Verifica se tem saldo suficiente
        if (userData.credits_balance < totalCost) {
            return new Response(JSON.stringify({ error: `Saldo insuficiente. Esta busca custa ${totalCost} créditos.` }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        // Desconta o saldo do usuário
        const { error: updateError } = await supabaseClient
            .from('users')
            .update({ credits_balance: userData.credits_balance - totalCost })
            .eq('id', user.id)

        if (updateError) throw new Error(`Erro ao descontar saldo: ${updateError.message}`)

        // Registra a transação de débito na carteira
        const searchTypeDesc = isPremium ? 'Premium (com IA)' : 'Padrão'
        const { error: txError } = await supabaseClient
            .from('wallet_transactions')
            .insert({
                user_id: user.id,
                amount: -totalCost,
                transaction_type: 'debit',
                description: `Varredura ${searchTypeDesc}: ${region} - ${leadVolume} leads`
            })

        if (txError) throw new Error(`Erro ao registrar transação: ${txError.message}`)

        // Prepara a chamada para o Apify
        const apifyToken = Deno.env.get('APIFY_API_TOKEN')
        if (!apifyToken) {
            throw new Error("APIFY_API_TOKEN não está configurado.")
        }

        const projectUrl = Deno.env.get('SUPABASE_URL')
        if (!projectUrl) {
            throw new Error("SUPABASE_URL não está configurada.")
        }

        const projectId = projectUrl.match(/https:\/\/(.*?)\.supabase\.co/)?.[1]

        if (!projectId) {
            throw new Error("Não foi possível identificar o Project ID da URL do Supabase.")
        }

        const webhookUrl = `https://${projectId}.supabase.co/functions/v1/apify-webhook?user_id=${user.id}&keyword=${encodeURIComponent(keywords)}&region=${encodeURIComponent(region)}`

        const apifyPayload = {
            searchStringsArray: [keywords],
            locationQuery: region,
            maxCrawledPlacesPerSearch: leadVolume,
            language: "pt-BR",
        }

        // 1. Monta o array de webhooks
        const webhooksArray = [
            {
                eventTypes: ["ACTOR.RUN.SUCCEEDED"],
                requestUrl: webhookUrl
            }
        ];

        // 2. Converte para Base64 para blindar contra corrupção na URL
        const webhooksBase64 = btoa(JSON.stringify(webhooksArray));

        // 3. Chama a API do Apify passando o Base64 na URL, e deixa no body APENAS os dados da busca
        const apifyUrl = `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?webhooks=${webhooksBase64}`;

        const apifyResponse = await fetch(apifyUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apifyToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(apifyPayload)
        })

        if (!apifyResponse.ok) {
            const errorText = await apifyResponse.text()
            throw new Error(`Falha ao iniciar extração no Apify: ${apifyResponse.status} - ${errorText}`)
        }

        // Tudo deu certo! Retorna sucesso imediatamente para o front.
        return new Response(JSON.stringify({ success: true, message: 'Varredura iniciada!' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        return new Response(JSON.stringify({ error: errorMessage }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})