# Agenda da Família

Aplicativo familiar em React + TypeScript, Tailwind CSS, Express e Vercel Functions. A interface funciona em modo demonstração antes do login. No modo conectado, Calendar e Tasks recebem os compromissos e tarefas; o Firestore guarda projetos, contatos e os metadados compartilhados da família.

## Rodar localmente

1. `npm install`
2. Copie `.env.example` para `.env.local` e configure os valores abaixo.
3. `npm run dev` inicia o Vite em `http://localhost:5173`.
4. `npm run dev:server` inicia a API Express em `http://localhost:8787`.

O servidor local precisa de uma conta de serviço Firebase para acessar o Firestore. Para usar só a demonstração, abra o Vite sem iniciar a API.

## Google e Firebase

No Firebase Console, ative Google como provedor de autenticação, configure os domínios autorizados e habilite o Firestore. Configure no provedor Google do Firebase o OAuth Client ID `621660728460-tr4mudiamdb6cvse4b8hc72dpk2c152v.apps.googleusercontent.com`; o app solicita os escopos Calendar Events, Google Tasks e perfil/e-mail. A lista autorizada é validada no navegador e novamente pela API: `daphneklann@gmail.com` e `vnsnet@gmail.com`.

Crie uma conta de serviço para a API, atribua somente os papéis Firebase/Firestore necessários e defina `FIREBASE_SERVICE_ACCOUNT_BASE64` com o JSON da chave em Base64. Essa variável é secreta e existe apenas no servidor. Não coloque a chave da conta de serviço no frontend, no Git ou no `.env.example`.

Para que Daphne e Vinícius vejam os mesmos compromissos, compartilhe um calendário Google com as duas contas e defina o ID dele em `GOOGLE_CALENDAR_ID`. `primary` é o padrão e aponta para o calendário principal de quem está conectado. As listas do Google Tasks são pessoais e não são compartilhadas pela API; por isso o app guarda tarefas/projetos da família no Firestore e mantém uma cópia sincronizada na lista de Tasks de cada pessoa autorizada.

As categorias, pessoa, projeto, prioridade e marca de tarefa complexa são metadados do app. Eventos usam `extendedProperties.private`; tarefas levam uma pequena anotação JSON no campo de notas do Google Tasks. O token OAuth de acesso é mantido em memória no navegador e enviado somente nas chamadas autenticadas à API. A API valida o token e o e-mail permitido em cada requisição.

## Publicar no Vercel

O projeto usa o diretório raiz e `vercel.json` para servir o build do Vite e encaminhar `/api/*` à Function Express. Configure no Vercel as variáveis `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `FIREBASE_SERVICE_ACCOUNT_BASE64` e `GOOGLE_CALENDAR_ID`. Marque a conta de serviço como segredo. A API mantém a lista de acesso fixa para Daphne e Vinícius. Depois, conecte o repositório `daphneklann-art/agenda-familia` ao projeto Vercel existente e publique a branch principal.

Antes de produção, adicione o domínio final como domínio autorizado no Firebase e na tela OAuth do Google. O endereço atual do Site Agenda da Família continua separado deste projeto Vercel até que o domínio seja conectado no painel.
