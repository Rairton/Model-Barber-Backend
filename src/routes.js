import express from 'express';
import { Cliente, Servico, Agendamento } from './models.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// WhatsApp Link (salvo em arquivo simples)
const whatsappFile = path.join(process.cwd(), 'src', 'whatsapp.json');

function getWhatsappData() {
  try {
    if (fs.existsSync(whatsappFile)) {
      return JSON.parse(fs.readFileSync(whatsappFile, 'utf8'));
    }
  } catch {}
  return { link: '', habilitado: false };
}

function setWhatsappData(data) {
  fs.writeFileSync(whatsappFile, JSON.stringify(data));
}

// Horários de funcionamento (arquivo simples)
const horariosFile = path.join(process.cwd(), 'src', 'horarios.json');
function getHorariosData() {
  try {
    if (fs.existsSync(horariosFile)) {
      return JSON.parse(fs.readFileSync(horariosFile, 'utf8'));
    }
  } catch {}
  // padrão: Seg a Sáb aberto (08:00 às 19:00), Domingo fechado; almoço 12:00 às 13:00
  return {
    padrao: { abre: '08:00', fecha: '19:00', almocoInicio: '12:00', almocoFim: '13:00' },
    dias: { '0': { fechado: true } },
    excecoes: []
  };
}
function setHorariosData(data) {
  fs.writeFileSync(horariosFile, JSON.stringify(data));
}

const SLOT_MINUTES = 15;

function timeToMinutes(t) {
  if (!t || typeof t !== 'string' || !t.includes(':')) return null;
  const [hh, mm] = t.split(':').map(n => parseInt(n, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return (hh * 60) + mm;
}

function minutesToTimeStr(mins) {
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function ceilToSlotMinutes(durationMinutes) {
  const dur = Number(durationMinutes) || 0;
  if (dur <= 0) return SLOT_MINUTES;
  return Math.ceil(dur / SLOT_MINUTES) * SLOT_MINUTES;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function getFuncionamentoParaData(horariosData, dataStr) {
  const padrao = horariosData?.padrao || { abre: '09:00', fecha: '19:00', almocoInicio: '12:00', almocoFim: '13:00' };
  const dias = horariosData?.dias || {};
  const excecoes = Array.isArray(horariosData?.excecoes) ? horariosData.excecoes : [];

  const exc = excecoes.find(e => e?.data === dataStr);
  if (exc) {
    if (exc.fechado) return { fechado: true };
    const semAlmoco = exc.semAlmoco === true;
    return {
      fechado: false,
      abre: exc.abre || padrao.abre,
      fecha: exc.fecha || padrao.fecha,
      almocoInicio: semAlmoco ? null : (exc.almocoInicio || padrao.almocoInicio),
      almocoFim: semAlmoco ? null : (exc.almocoFim || padrao.almocoFim)
    };
  }

  const d = new Date(dataStr + 'T00:00');
  const weekday = d.getDay();
  const diaCfg = dias?.[weekday] || dias?.[String(weekday)];

  if (diaCfg?.fechado === true || diaCfg?.aberto === false) return { fechado: true };

  const semAlmoco = diaCfg?.semAlmoco === true;

  return {
    fechado: false,
    abre: diaCfg?.abre || padrao.abre,
    fecha: diaCfg?.fecha || padrao.fecha,
    almocoInicio: semAlmoco ? null : (diaCfg?.almocoInicio || padrao.almocoInicio),
    almocoFim: semAlmoco ? null : (diaCfg?.almocoFim || padrao.almocoFim)
  };
}

function isStartValidForDuration(func, startMinutes, durationMinutes) {
  const abreMin = timeToMinutes(func.abre);
  const fechaMin = timeToMinutes(func.fecha);
  if (abreMin == null || fechaMin == null || fechaMin <= abreMin) return false;

  const durSlot = ceilToSlotMinutes(durationMinutes);
  const endMinutes = startMinutes + durSlot;

  if (startMinutes < abreMin) return false;
  if (endMinutes > fechaMin) return false;

  const almocoIniMin = timeToMinutes(func.almocoInicio);
  const almocoFimMin = timeToMinutes(func.almocoFim);
  if (almocoIniMin != null && almocoFimMin != null && almocoFimMin > almocoIniMin) {
    if (rangesOverlap(startMinutes, endMinutes, almocoIniMin, almocoFimMin)) return false;
  }

  return true;
}

function gerarSlotsDia(func, durationMinutes = SLOT_MINUTES) {
  const abreMin = timeToMinutes(func.abre);
  const fechaMin = timeToMinutes(func.fecha);
  if (abreMin == null || fechaMin == null || fechaMin <= abreMin) return [];

  const slots = [];
  for (let m = abreMin; m < fechaMin; m += SLOT_MINUTES) {
    if (!isStartValidForDuration(func, m, durationMinutes)) continue;
    // isStartValid já exclui almoço/fechamento
    slots.push(minutesToTimeStr(m));
  }
  return slots;
}

function getAgendamentoDuracaoMin(ag) {
  let total = 0;
  if (Array.isArray(ag.servicos) && ag.servicos.length > 0) {
    for (const s of ag.servicos) {
      total += Number(s?.duracao) || Number(s?.duracaoMin) || 0;
    }
  } else if (ag.servico) {
    total += Number(ag.servico?.duracao) || Number(ag.servico?.duracaoMin) || 0;
  }
  return total > 0 ? total : 30;
}

// Clientes
router.get('/clientes', async (req, res) => {
  try {
    const clientes = await Cliente.find();
    res.json(clientes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// Listar barbeiros
router.get('/barbeiros', async (req, res) => {
  try {
    // Garante que "chefe admin-only" nunca apareça como barbeiro, mesmo se barbeiro:true por erro
    const barbeiros = await Cliente.find({ barbeiro: true, chefeAdminOnly: { $ne: true } });
    res.json(barbeiros);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/clientes/:id', async (req, res) => {
  try {
    const { nome, sobrenome, telefone } = req.body;
    const cliente = await Cliente.findByIdAndUpdate(
      req.params.id,
      { nome, sobrenome, telefone },
      { new: true }
    );
    res.json(cliente);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Serviços
router.get('/servicos', async (req, res) => {
  try {
    const servicos = await Servico.find();
    res.json(servicos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/servicos', async (req, res) => {
  try {
    const { nome, duracao, valor, preco, duracaoMin } = req.body;

    const valorFinal = valor != null ? valor : preco;
    const duracaoFinal = duracao != null ? duracao : duracaoMin;

    if (!nome || duracaoFinal == null || valorFinal == null) {
      return res.status(400).json({ message: 'Dados obrigatórios ausentes.' });
    }

    const servico = new Servico({
      nome,
      duracao: Number(duracaoFinal),
      valor: Number(valorFinal),
      // compatibilidade
      duracaoMin: duracaoMin != null ? Number(duracaoMin) : undefined,
      preco: preco != null ? Number(preco) : undefined
    });
    await servico.save();
    res.status(201).json(servico);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/servicos/:id', async (req, res) => {
  try {
    const { nome, duracao, valor, preco, duracaoMin } = req.body;

    const update = {
      nome,
      duracao: duracao != null ? Number(duracao) : (duracaoMin != null ? Number(duracaoMin) : undefined),
      valor: valor != null ? Number(valor) : (preco != null ? Number(preco) : undefined),
      // compatibilidade
      duracaoMin: duracaoMin != null ? Number(duracaoMin) : undefined,
      preco: preco != null ? Number(preco) : undefined
    };

    const servico = await Servico.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );
    res.json(servico);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/servicos/:id', async (req, res) => {
  try {
    await Servico.findByIdAndDelete(req.params.id);
    res.json({ message: 'Serviço deletado.' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Alterar função de barbeiro (barbeiro/chefe)
router.patch('/barbeiros/:id/funcao', async (req, res) => {
  try {
    const { funcao } = req.body;
    if (!['barbeiro', 'chefe', ''].includes(funcao)) {
      return res.status(400).json({ message: 'Função inválida.' });
    }
    const existente = await Cliente.findById(req.params.id);
    if (!existente) return res.status(404).json({ message: 'Usuário não encontrado.' });

    // Invariável:
    // - Chefes admin-only devem ter chefeAdminOnly:true
    // - Barbeiro (inclusive chefe que é barbeiro) deve ter chefeAdminOnly:false
    let chefeAdminOnly = false;
    if (funcao === 'chefe' && !existente.barbeiro) {
      chefeAdminOnly = true;
    }

    const barbeiro = await Cliente.findByIdAndUpdate(
      req.params.id,
      { funcao, chefeAdminOnly },
      { new: true }
    );
    res.json(barbeiro);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Adicionar barbeiro (setar barbeiro: true)
router.patch('/barbeiros/:id/add', async (req, res) => {
  try {
    const barbeiro = await Cliente.findByIdAndUpdate(
      req.params.id,
      { barbeiro: true, funcao: 'barbeiro', chefeAdminOnly: false },
      { new: true }
    );
    res.json(barbeiro);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Remover barbeiro (setar barbeiro: false e funcao: '')
router.patch('/barbeiros/:id/remove', async (req, res) => {
  try {
    const barbeiro = await Cliente.findByIdAndUpdate(
      req.params.id,
      { barbeiro: false, funcao: '', chefeAdminOnly: false },
      { new: true }
    );
    res.json(barbeiro);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// Ajustar cadastro para aceitar sobrenome e senha
router.post('/clientes', async (req, res) => {
  try {
    const { nome, sobrenome, email, telefone, senha } = req.body;
    if (!nome || !sobrenome || !email || !telefone || !senha) {
      return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
    }
    const cliente = new Cliente({ nome, sobrenome, email, telefone, senha, barbeiro: false });
    await cliente.save();
    res.status(201).json(cliente);
  } catch (e) {
    console.error('Erro ao cadastrar cliente:', e);
    res.status(400).json({ error: e.message, stack: e.stack });
  }
});
// Rota de login de cliente
router.post('/clientes/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
    }
    // Busca cliente pelo email
    const cliente = await Cliente.findOne({ email });
    if (!cliente) {
      return res.status(401).json({ message: 'Email ou senha inválidos.' });
    }
    // Verifica senha (simples, sem hash)
    if (cliente.senha !== senha) {
      return res.status(401).json({ message: 'Email ou senha inválidos.' });
    }
    // Retorna dados do cliente (sem senha)
    const { nome, sobrenome, email: emailCliente, telefone, _id, barbeiro, funcao } = cliente;
    res.json({ nome, sobrenome, email: emailCliente, telefone, _id, barbeiro, funcao });
  } catch (e) {
    res.status(500).json({ message: 'Erro no login.' });
  }
});

// Agendamentos
router.get('/agendamentos', async (req, res) => {
  try {
    const agendamentos = await Agendamento.find().populate('cliente').populate('servico');
    res.json(agendamentos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// Listar agendamentos por status
router.get('/agendamentos/status/:status', async (req, res) => {
  try {
    const agendamentos = await Agendamento.find({ status: req.params.status })
      .populate('cliente')
      .populate('servicos')
      .populate('barbeiro')
      .populate('barbeiroCancelou')
      .populate('preferenciaBarbeiro');
    res.json(agendamentos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Listar agendamentos de um cliente específico
router.get('/agendamentos/cliente/:clienteId', async (req, res) => {
  try {
    const agendamentos = await Agendamento.find({ cliente: req.params.clienteId })
      .populate('servicos')
      .populate('barbeiro')
      .populate('preferenciaBarbeiro')
      .sort({ data: -1 });
    res.json(agendamentos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Aceitar agendamento (barbeiro)
router.patch('/agendamentos/:id/aceitar', async (req, res) => {
  try {
    const { barbeiroId } = req.body;
    const ag = await Agendamento.findById(req.params.id).populate('servico');
    if (!ag) return res.status(404).json({ message: 'Agendamento não encontrado.' });
    // Regras de aceitação:
    // - Se tem preferência, só o barbeiro selecionado aceita
    // - Se liberadoAte está no futuro, qualquer barbeiro pode aceitar
    // - Se sem preferência, qualquer barbeiro pode aceitar
    const agora = new Date();
    const preferOk = ag.preferenciaBarbeiro && String(ag.preferenciaBarbeiro) === String(barbeiroId);
    const liberado = ag.liberadoAte && ag.liberadoAte > agora;
    const semPref = !ag.preferenciaBarbeiro;
    if (!(preferOk || liberado || semPref)) {
      return res.status(403).json({ message: 'Este agendamento não está disponível para você.' });
    }
    ag.status = 'agendado';
    ag.barbeiro = barbeiroId;
    ag.dataAceite = agora;
    ag.preferenciaBarbeiro = undefined;
    ag.liberadoAte = undefined;
    await ag.save();
    res.json(ag);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Recusar agendamento (barbeiro)
router.patch('/agendamentos/:id/recusar', async (req, res) => {
  try {
    const { barbeiroId } = req.body;
    const ag = await Agendamento.findById(req.params.id);
    if (!ag) return res.status(404).json({ message: 'Agendamento não encontrado.' });
    if (!barbeiroId) return res.status(400).json({ message: 'barbeiroId é obrigatório.' });

    const usuario = await Cliente.findById(barbeiroId, { funcao: 1, barbeiro: 1 });
    const isChefe = usuario?.funcao === 'chefe';

    // Nova regra:
    // - Chefe pode recusar qualquer pendente
    // - Barbeiro só pode recusar se for o preferencial
    if (!isChefe) {
      if (!ag.preferenciaBarbeiro || String(ag.preferenciaBarbeiro) !== String(barbeiroId)) {
        return res.status(403).json({ message: 'Apenas o barbeiro preferencial pode recusar.' });
      }
    }

    ag.status = 'cancelado';
    ag.dataCancelamento = new Date();
    ag.barbeiroCancelou = barbeiroId;
    // Não libera para outros barbeiros
    ag.liberadoAte = undefined;
    await ag.save();
    res.json(ag);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Cancelar agendamento (barbeiro ou cliente)
router.patch('/agendamentos/:id/cancelar', async (req, res) => {
  try {
    const { barbeiroId, clienteId } = req.body;
    const ag = await Agendamento.findById(req.params.id);
    if (!ag) return res.status(404).json({ message: 'Agendamento não encontrado.' });
    ag.status = 'cancelado';
    ag.dataCancelamento = new Date();
    if (barbeiroId) ag.barbeiroCancelou = barbeiroId;
    if (clienteId) ag.clienteCancelou = clienteId;
    await ag.save();
    res.json(ag);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Finalizar agendamento (barbeiro)
router.patch('/agendamentos/:id/finalizar', async (req, res) => {
  try {
    const { barbeiroId } = req.body;
    const agendamento = await Agendamento.findByIdAndUpdate(
      req.params.id,
      { status: 'finalizado', barbeiro: barbeiroId, dataFinalizacao: new Date() },
      { new: true }
    );
    res.json(agendamento);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
router.post('/agendamentos', async (req, res) => {
  try {
    const { clienteId, servicos, data, hora, barbeiro, status } = req.body;
    
    if (!clienteId || !servicos || !Array.isArray(servicos) || servicos.length === 0 || !data || !hora) {
      return res.status(400).json({ message: 'Dados obrigatórios ausentes.' });
    }

    // Combinar data e hora
    const [year, month, day] = data.split('-');
    const [hh, mm] = hora.split(':');
    const dataHora = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hh), parseInt(mm));

    // Validação: slots de 15 em 15
    const minInt = parseInt(mm, 10);
    if (Number.isNaN(minInt) || (minInt % SLOT_MINUTES) !== 0) {
      return res.status(400).json({ message: `Horário inválido. Use intervalos de ${SLOT_MINUTES} minutos.` });
    }

    // Validar que não está no passado
    if (dataHora < new Date()) {
      return res.status(400).json({ message: 'Data/hora no passado não permitida.' });
    }

    // Duração total dos serviços
    const servicosDocs = await Servico.find({ _id: { $in: servicos } });
    const duracaoTotal = servicosDocs.reduce((acc, s) => acc + (Number(s?.duracao) || Number(s?.duracaoMin) || 0), 0) || 30;

    // Validar funcionamento (dia aberto + dentro do horário)
    const horariosCfg = getHorariosData();
    const func = getFuncionamentoParaData(horariosCfg, data);
    if (func?.fechado) {
      return res.status(400).json({ message: 'A barbearia estará fechada nesta data.' });
    }

    const startMinutes = (parseInt(hh, 10) * 60) + parseInt(mm, 10);
    if (!isStartValidForDuration(func, startMinutes, duracaoTotal)) {
      return res.status(400).json({ message: 'Horário fora do funcionamento ou conflita com o intervalo de almoço.' });
    }

    // Verificar disponibilidade real (com duração)
    const d = new Date(data + 'T00:00');
    const endOfDay = new Date(d.getTime() + 24 * 60 * 60 * 1000);

    const agendados = await Agendamento.find({
      status: { $in: ['pendente', 'agendado'] },
      data: { $gte: d, $lt: endOfDay }
    }).populate('servicos').populate('servico');

    const requestedDurSlot = ceilToSlotMinutes(duracaoTotal);
    const requestedSlots = new Set();
    for (let m = startMinutes; m < startMinutes + requestedDurSlot; m += SLOT_MINUTES) {
      requestedSlots.add(minutesToTimeStr(m));
    }

    const ocupadosPorBarbeiro = {};
    const barbeiros = await Cliente.find({ barbeiro: true }, { _id: 1 });
    barbeiros.forEach(b => { ocupadosPorBarbeiro[String(b._id)] = new Set(); });

    for (const ag of agendados) {
      const agStart = (ag.data.getHours() * 60) + ag.data.getMinutes();
      const agDur = ceilToSlotMinutes(getAgendamentoDuracaoMin(ag));
      const agSlots = [];
      for (let m = agStart; m < agStart + agDur; m += SLOT_MINUTES) {
        agSlots.push(minutesToTimeStr(m));
      }

      const ids = new Set();
      if (ag.barbeiro) ids.add(String(ag.barbeiro));
      if (ag.preferenciaBarbeiro) ids.add(String(ag.preferenciaBarbeiro));

      for (const id of ids) {
        if (!ocupadosPorBarbeiro[id]) ocupadosPorBarbeiro[id] = new Set();
        agSlots.forEach(s => ocupadosPorBarbeiro[id].add(s));
      }
    }

    const intersects = (setA, setB) => {
      for (const v of setB) if (setA.has(v)) return true;
      return false;
    };

    if (barbeiro) {
      const id = String(barbeiro);
      const ocupadosSet = ocupadosPorBarbeiro[id] || new Set();
      if (intersects(ocupadosSet, requestedSlots)) {
        return res.status(409).json({ message: 'Horário indisponível para este barbeiro.' });
      }
    } else {
      // sem preferência: precisa existir pelo menos 1 barbeiro livre
      let algumLivre = false;
      for (const b of barbeiros) {
        const id = String(b._id);
        const ocupadosSet = ocupadosPorBarbeiro[id] || new Set();
        if (!intersects(ocupadosSet, requestedSlots)) {
          algumLivre = true;
          break;
        }
      }
      if (!algumLivre) {
        return res.status(409).json({ message: 'Não há barbeiros disponíveis neste horário.' });
      }
    }

    // Criar novo agendamento
    const agendamento = new Agendamento({
      data: dataHora,
      cliente: clienteId,
      servicos: servicos,
      status: status || 'pendente',
      barbeiro: barbeiro || undefined,
      preferenciaBarbeiro: barbeiro || undefined
    });

    await agendamento.save();
    await agendamento.populate([
      { path: 'servicos' },
      { path: 'cliente' },
      { path: 'barbeiro' },
      { path: 'preferenciaBarbeiro' }
    ]);

    res.status(201).json(agendamento);
  } catch (e) {
    console.error('[POST /agendamentos] erro:', e);
    res.status(400).json({ message: e.message });
  }
});

// Deletar cliente específico
router.delete('/clientes/:id', async (req, res) => {
  try {
    const cliente = await Cliente.findByIdAndDelete(req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
    // Também deletar todos os agendamentos do cliente
    await Agendamento.deleteMany({ cliente: req.params.id });
    res.json({ message: 'Conta excluída com sucesso.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint temporário para deletar todos os clientes (apenas para desenvolvimento)
router.delete('/clientes', async (req, res) => {
  try {
    await Cliente.deleteMany({});
    res.json({ message: 'Todos os clientes foram removidos.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET - Recuperar link
router.get('/whatsapp', (req, res) => {
  res.json(getWhatsappData());
});

// POST - Salvar/editar link
router.post('/whatsapp', (req, res) => {
  const { link } = req.body;
  if (!link) return res.status(400).json({ error: 'Link obrigatório.' });
  setWhatsappData({ link, habilitado: true });
  res.json({ success: true });
});

// PATCH - Habilitar/desabilitar
router.patch('/whatsapp', (req, res) => {
  const { habilitado } = req.body;
  const data = getWhatsappData();
  data.habilitado = !!habilitado;
  setWhatsappData(data);
  res.json({ success: true });
});

// Horários: GET/POST/PATCH
router.get('/horarios', (req, res) => {
  res.json(getHorariosData());
});
router.post('/horarios', (req, res) => {
  const { padrao, dias } = req.body;
  const atual = getHorariosData();
  if (padrao && padrao.abre && padrao.fecha) {
    atual.padrao = {
      abre: padrao.abre,
      fecha: padrao.fecha,
      almocoInicio: padrao.almocoInicio || atual.padrao?.almocoInicio || '12:00',
      almocoFim: padrao.almocoFim || atual.padrao?.almocoFim || '13:00'
    };
  }
  if (dias && typeof dias === 'object') atual.dias = dias;
  setHorariosData(atual);
  res.json({ success: true, horarios: atual });
});
router.patch('/horarios', (req, res) => {
  const { excecao } = req.body; // { data: 'YYYY-MM-DD', abre, fecha }
  const atual = getHorariosData();
  if (excecao && excecao.data) {
    // Substitui ou adiciona
    const idx = atual.excecoes.findIndex(e => e.data === excecao.data);
    if (idx >= 0) atual.excecoes[idx] = excecao; else atual.excecoes.push(excecao);
  }
  setHorariosData(atual);
  res.json({ success: true, horarios: atual });
});

// Remover exceção específica por data (YYYY-MM-DD)
router.delete('/horarios/excecoes/:data', (req, res) => {
  const { data } = req.params;
  if (!data) return res.status(400).json({ success: false, message: 'Data inválida.' });
  const atual = getHorariosData();
  const antes = Array.isArray(atual.excecoes) ? atual.excecoes.length : 0;
  atual.excecoes = (Array.isArray(atual.excecoes) ? atual.excecoes : []).filter(e => e.data !== data);
  const depois = atual.excecoes.length;
  setHorariosData(atual);
  res.json({ success: true, removed: antes - depois, horarios: atual });
});

// GET horários ocupados de um barbeiro específico em uma data
router.get('/agendamentos/ocupados/:barbeiroId', async (req, res) => {
  try {
    const { barbeiroId } = req.params;
    const { data } = req.query; // YYYY-MM-DD
    if (!data) return res.status(400).json({ horarios: [] });
    
    const d = new Date(data + 'T00:00');
    const agendados = await Agendamento.find({
      $or: [
        { barbeiro: barbeiroId, status: { $in: ['pendente', 'agendado'] } },
        { preferenciaBarbeiro: barbeiroId, status: { $in: ['pendente', 'agendado'] } }
      ],
      data: { $gte: d, $lt: new Date(d.getTime() + 24*60*60*1000) }
    }).populate('servicos').populate('servico');

    const horariosSet = new Set();
    agendados.forEach(ag => {
      const start = (ag.data.getHours() * 60) + ag.data.getMinutes();
      const dur = ceilToSlotMinutes(getAgendamentoDuracaoMin(ag));
      for (let m = start; m < start + dur; m += SLOT_MINUTES) {
        horariosSet.add(minutesToTimeStr(m));
      }
    });

    res.json({ horarios: Array.from(horariosSet) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET horários disponíveis (sem preferência - retorna horários que algum barbeiro tem livre)
router.get('/agendamentos/disponiveis', async (req, res) => {
  try {
    const { data, duracao } = req.query; // YYYY-MM-DD
    if (!data) return res.status(400).json({ disponiveis: [] });

    const duracaoMin = Number(duracao) || SLOT_MINUTES;

    const horariosCfg = getHorariosData();
    const func = getFuncionamentoParaData(horariosCfg, data);
    if (func?.fechado) return res.json({ disponiveis: [], fechado: true });

    const slotsDia = gerarSlotsDia(func, duracaoMin);
    if (!slotsDia.length) return res.json({ disponiveis: [] });
    
    const d = new Date(data + 'T00:00');
    const barbeiros = await Cliente.find({ barbeiro: true });
    
    // Buscar todos os agendamentos nessa data
    const agendados = await Agendamento.find({
      status: { $in: ['pendente', 'agendado'] },
      data: { $gte: d, $lt: new Date(d.getTime() + 24*60*60*1000) }
    }).populate('servicos').populate('servico');
    
    const ocupadosPorBarbeiro = {};
    barbeiros.forEach(b => { ocupadosPorBarbeiro[String(b._id)] = new Set(); });

    agendados.forEach(ag => {
      const start = (ag.data.getHours() * 60) + ag.data.getMinutes();
      const dur = ceilToSlotMinutes(getAgendamentoDuracaoMin(ag));
      const slots = [];
      for (let m = start; m < start + dur; m += SLOT_MINUTES) {
        slots.push(minutesToTimeStr(m));
      }

      const ids = new Set();
      if (ag.barbeiro) ids.add(String(ag.barbeiro));
      if (ag.preferenciaBarbeiro) ids.add(String(ag.preferenciaBarbeiro));

      for (const id of ids) {
        if (!ocupadosPorBarbeiro[id]) ocupadosPorBarbeiro[id] = new Set();
        slots.forEach(s => ocupadosPorBarbeiro[id].add(s));
      }
    });

    const disponiveis = [];
    slotsDia.forEach(slot => {
      // Disponível se existe pelo menos 1 barbeiro que não está ocupado neste slot
      for (const b of barbeiros) {
        const set = ocupadosPorBarbeiro[String(b._id)] || new Set();
        if (!set.has(slot)) {
          disponiveis.push(slot);
          break;
        }
      }
    });

    res.json({ disponiveis });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
