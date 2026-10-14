cat << 'EOF' > .cursorrules
# Regras do Projeto Camarote Shows (Refatoração Bubble -> Next.js + Supabase)

1. FONTE DA VERDADE: Antes de criar qualquer tabela, rota, componente ou validação, consulte SEMPRE o arquivo `docs/especificacao.md`.
2. STACK: Next.js (App Router), TypeScript estrito, Supabase (@supabase/ssr), Tailwind CSS, shadcn/ui, Sonner (toasts), date-fns (fuso America/Fortaleza, formato dd/MM/yyyy) e moeda BRL (Intl.NumberFormat('pt-BR')).
3. IDENTIDADE VISUAL (§15.1):
   - Cor Primária: #0205D3 (contraste #FFFFFF)
   - Texto: #091747 | Superfície: #FFFFFF | Destrutivo: #FF0000 | Sucesso: #17DB4E | Alerta: #FAB515
   - Fontes: Poppins (títulos e tabelas) e Roboto (cabeçalho).
4. REGRAS DE OURO E CORREÇÃO DE BUGS DO BUBBLE (§16 e §17):
   - NUNCA grave saldo de contas no banco; leia sempre da view `contas_saldo` (corrige B1 e B8).
   - NUNCA filtre apenas no front-end; toda query depende de RLS no Supabase (`na_empresa`, `tem_perfil`, `ve_artista`) (corrige S1, S2, S6).
   - Textos de cadastros são salvos em MAIÚSCULAS, EXCETO e-mail que deve ser salvo em minúsculas (corrige R7).
   - O bloqueio de contrato deve chamar a RPC `bloquear_contrato` garantindo que soma(negociacoes) == cache (R17).
   - Layout único e 100% responsivo (sem bloqueio de SO Windows vs Mobile - corrige T1 e T12).
EOF