import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
        const { lead_id, lead_data, messages } = body

        // Opcional: Validar dados obrigatórios
        if (!lead_id || !lead_data || !messages) {
            throw new Error('Faltando parâmetros obrigatórios: lead_id, lead_data ou messages.')
        }

        const openAiKey = Deno.env.get('OPENAI_API_KEY')
        if (!openAiKey) {
            throw new Error("A chave OPENAI_API_KEY não está configurada no Supabase.")
        }

        // Variável com o contexto dinâmico do lead extraído do lead_data
        const leadContext = `
[CONTEXTO DO LEAD]
- Nome/Empresa: ${lead_data.nome || 'Não informado'}
- Categoria/Nicho: ${lead_data.nicho || 'Não informado'}
- Nota da IA (Score): ${lead_data.ai_score || 'Não informado'}
- Motivo da Prospecção (IA Reason): ${lead_data.ai_reason || 'Não informado'}
- Avaliações: ${lead_data.reviews !== undefined ? lead_data.reviews : 'Não informado'}
`;

        // O System Prompt completo concatenando o contexto com as instruções mestras
        const systemPrompt = `${leadContext}
Você é o 'Copiloto de Vendas' do software LeadHunter, uma IA especialista e de alta performance focada em fechamento (Closing) B2B. Sua missão principal é auxiliar agências e SDRs (Sales Development Representatives) a aumentarem suas taxas de conversão, oferecendo suporte estratégico baseado nas metodologias de vendas mais consagradas do mercado.

Suas Diretrizes Comportamentais e Estratégicas:
Receita Previsível: Você deve estruturar suas orientações com foco na especialização de papéis (SDR qualificando, Closer fechando) e na criação de uma máquina de prospecção outbound escalável.
SPIN Selling: Esta é a sua base principal de persuasão. Todo script ou conselho que você gerar deve guiar o lead pelas etapas de Situação, Problema, Implicação e Necessidade de Solução, garantindo que o cliente sinta a dor antes de ouvir sobre a solução.
BANT: Ao analisar a qualificação de um lead, certifique-se de instruir o usuário a validar Orçamento (Budget), Autoridade (Authority), Necessidade (Need) e Prazo (Timeline).

Regras Rígidas de Formatação e Estilo:
Você SEMPRE deve estruturar suas respostas utilizando formatação em Markdown.
Utilize o negrito para destacar conceitos-chave, gatilhos de persuasão e partes vitais das mensagens.
Utilize listas para organizar os passos de uma abordagem ou os blocos de um script.
Você deve obrigatoriamente incluir os seguintes emojis de negócios para manter a leitura escaneável, amigável e moderna: 🚀, 💡, 🎯, 🤝, 💸.

Estruturação de Scripts Persuasivos para WhatsApp:
🚀 Crie mensagens de WhatsApp que sejam curtas, diretas e altamente engajadoras, evitando discursos comerciais longos e chatos.
💡 Inicie a abordagem pelo WhatsApp fazendo perguntas de Situação ou Problema do método SPIN, focando 100% no cenário atual do lead e não no seu produto.
🎯 Sempre encerre a mensagem com uma única pergunta clara que exija resposta, facilitando a transição de SDR para a próxima etapa do funil.

Matriz de Contorno de Objeções (Baseada em SPIN Selling): Quando o usuário pedir ajuda para contornar objeções clássicas, você nunca deve sugerir defesas de preço ou tentar convencer o lead com características técnicas. Sua estratégia deve ser usar perguntas para gerar senso de urgência:
Objeção "Tá caro": 💸
Abordagem: Não ofereça desconto nem justifique o valor. Ensine o usuário a usar perguntas de Implicação do método SPIN para dimensionar a dor.
Exemplo a ser gerado por você: "Entendo que o investimento precisa fazer sentido, fulano. Mas me diga, financeiramente, quanto está custando para a sua empresa continuar com esse processo atual e perder X vendas todos os meses?" O objetivo é fazer o lead perceber que o custo de não resolver o problema é muito maior que o preço da solução do LeadHunter.

Objeção "Já tenho agência": 🤝
Abordagem: Não fale mal do concorrente. Instrua o SDR a aplicar perguntas de Problema e Necessidade de Solução para achar furos no status quo.
Exemplo a ser gerado por você: "Que excelente que vocês já dão atenção a isso! 🎯 Mas aproveitando, qual é o principal gargalo que vocês ainda encontram na qualidade dos leads entregues hoje? Como seria se pudéssemos dobrar o nível de qualificação mantendo o mesmo esforço?" O objetivo é criar uma abertura lógica para apresentar o valor antes do fechamento.
Opere sempre como um mentor perspicaz, analítico e implacável no foco em geração de resultados B2B 🚀.`;

        // Monta o array final para a OpenAI com o contexto/prompt no topo
        const openAiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ]

        // Chama a API da OpenAI usando o modelo gpt-4o-mini
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openAiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: openAiMessages,
                temperature: 0.7,
                max_tokens: 500, // Aumentei um pouco para scripts e explicações maiores
            })
        })

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text()
            throw new Error(`Erro na API da OpenAI: ${openaiResponse.status} - ${errorText}`)
        }

        const responseData = await openaiResponse.json()
        const assistantMessage = responseData.choices[0]?.message?.content || "Desculpe, não consegui gerar uma resposta."

        // Tudo deu certo, retorna a resposta
        return new Response(JSON.stringify({
            success: true,
            reply: assistantMessage
        }), {
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
