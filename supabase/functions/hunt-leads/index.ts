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
        const { leadVolume, region, keywords } = body

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
        if (userData.credits_balance < leadVolume) {
            return new Response(JSON.stringify({ error: 'Saldo insuficiente. Recarregue sua carteira.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        // Desconta o saldo do usuário
        const { error: updateError } = await supabaseClient
            .from('users')
            .update({ credits_balance: userData.credits_balance - leadVolume })
            .eq('id', user.id)

        if (updateError) throw new Error(`Erro ao descontar saldo: ${updateError.message}`)

        // Registra a transação de débito na carteira
        const { error: txError } = await supabaseClient
            .from('wallet_transactions')
            .insert({
                user_id: user.id,
                amount: -leadVolume,
                transaction_type: 'debit',
                description: `Varredura tática: ${region} - ${leadVolume} leads`
            })

        if (txError) throw new Error(`Erro ao registrar transação: ${txError.message}`)

        // Insere Leads Falsos (Mockados) no CRM
        const mockLeads = [
            { user_id: user.id, company_name: "Oficina Master Express", address: region, no_website: true, ai_score: 98, status: 'Novos Leads' },
            { user_id: user.id, company_name: "Clínica Sorriso Center", address: region, no_website: true, ai_score: 92, status: 'Novos Leads' },
            { user_id: user.id, company_name: "Mecânica Dois Irmãos", address: region, no_website: true, ai_score: 85, status: 'Novos Leads' }
        ]

        const { error: leadsError } = await supabaseClient.from('leads').insert(mockLeads)

        if (leadsError) throw new Error(`Erro ao inserir leads: ${leadsError.message}`)

        // Tudo deu certo! Retorna sucesso.
        return new Response(JSON.stringify({ success: true, message: 'Varredura concluída com sucesso!' }), {
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