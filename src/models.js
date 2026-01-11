import mongoose from 'mongoose';

// Adicionar campo senha, sobrenome e barbeiro ao schema de Cliente
const ClienteSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  sobrenome: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  telefone: { type: String, required: true },
  senha: { type: String, required: true },
  barbeiro: { type: Boolean, default: false },
  funcao: { type: String, enum: ['', 'barbeiro', 'chefe'], default: '' },
  // Chefe (admin) que não deve aparecer como barbeiro (mesmo se barbeiro:true por erro)
  chefeAdminOnly: { type: Boolean, default: false }
});
export const Cliente = mongoose.model('Cliente', ClienteSchema);

const ServicoSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  valor: { type: Number, required: true },
  duracao: { type: Number, default: 30 }, // duração em minutos
  preco: { type: Number }, // mantém compatibilidade
  duracaoMin: { type: Number } // mantém compatibilidade
});
export const Servico = mongoose.model('Servico', ServicoSchema);

const AgendamentoSchema = new mongoose.Schema({
  data: { type: Date, required: true },
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', required: true },
  servicos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Servico' }], // múltiplos serviços
  servico: { type: mongoose.Schema.Types.ObjectId, ref: 'Servico' }, // compatibilidade
  status: { type: String, enum: ['pendente', 'agendado', 'finalizado', 'cancelado'], default: 'pendente' },
  barbeiro: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente' }, // barbeiro responsável (quando aceito)
  preferenciaBarbeiro: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente' }, // preferência escolhida pelo cliente
  liberadoAte: { type: Date }, // janela de 10min liberada para todos após recusa
  dataAceite: { type: Date },
  dataFinalizacao: { type: Date },
  dataCancelamento: { type: Date },
  barbeiroCancelou: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente' },
  clienteCancelou: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente' }
});
export const Agendamento = mongoose.model('Agendamento', AgendamentoSchema);
