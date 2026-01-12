import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import routes from './routes.js';

dotenv.config();

const app = express();
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://model-barber.vercel.app',
    'https://model-barber-frontend-f3yoepbb8-rairtons-projects.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());
app.use(bodyParser.json());
app.use('/api', routes);

const PORT = process.env.PORT || 3001;


connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
});



