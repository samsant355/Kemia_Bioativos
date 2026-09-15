# Kemia · Gestão de produção

App de gestão para a linha de produtos Kemia — insumos, produtos, produção por lote,
estoque, parceiros comerciais e vendas. Conectado ao Supabase.

## Publicar (sem usar linha de comando)

### 1. Suba este projeto pro GitHub
1. Crie uma conta grátis em [github.com](https://github.com) (se ainda não tiver)
2. Clique em **New repository** → dê um nome (ex: `kemia-gestao`) → **Create repository**
3. Na página do repositório vazio, clique em **"uploading an existing file"**
4. Arraste TODOS os arquivos e pastas deste projeto (menos `node_modules`, que não deve
   ir) para a área de upload
5. Clique em **Commit changes**

### 2. Importe no Vercel
1. Crie conta em [vercel.com](https://vercel.com) (pode entrar com a conta do GitHub)
2. Clique em **Add New → Project**
3. Selecione o repositório `kemia-gestao` que você acabou de criar
4. Antes de clicar em Deploy, abra **Environment Variables** e adicione:
   - `VITE_SUPABASE_URL` = a URL do seu projeto Supabase
   - `VITE_SUPABASE_KEY` = a publishable key do seu projeto Supabase
5. Clique em **Deploy**

Em ~1 minuto você recebe um link tipo `kemia-gestao.vercel.app` — esse é o site
publicado de verdade, já salvando tudo no seu banco de dados Supabase.

### 3. Adicionar à tela inicial do celular
Abra o link no navegador do celular → menu do navegador → **"Adicionar à tela inicial"**.

## Rodar localmente (opcional, se algum dia usar um computador com Node.js instalado)
```
npm install
cp .env.example .env    # depois edite .env com suas chaves reais
npm run dev
```
