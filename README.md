# Instruções para rodar o backend

1. Abra o terminal na pasta backend:
   cd backend

2. Instale as dependências:
   npm install

3. Configure o arquivo .env com sua string de conexão do MongoDB Atlas:
   MONGO_URI=mongodb+srv://rairton:rairton5432@modelbarber.fnsw4ux.mongodb.net/?appName=ModelBarber

4. Inicie o servidor em modo desenvolvimento:
   npm run dev

A API estará disponível em http://localhost:3001/api

Rotas principais:
- GET/POST /api/clientes
- GET/POST /api/servicos
- GET/POST /api/agendamentos

Qualquer dúvida, peça ajuda!
