// 1. Importar as ferramentas
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer'); // Ferramenta para uploads
const mongoose = require('mongoose'); // <-- NOVO: Para o MongoDB
require('dotenv').config(); // <-- NOVO: Para carregar o .env

// 2. Configurar o servidor
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));
const PORT = process.env.PORT || 3000; // <-- MODIFICADO: Para hospedagem
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // <-- MODIFICADO: Do .env

// --- NOVO: Lógica do Banco de Dados (Mongoose) ---

// 3. Conectar ao MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Conectado ao MongoDB Atlas com sucesso!"))
  .catch(err => console.error("Erro ao conectar ao MongoDB:", err));

// 4. Definir os "Modelos" (Schemas)
// Isso diz ao MongoDB como os dados devem ser estruturados.
// Substitui os arquivos .json

const GuestSchema = new mongoose.Schema({
  Nome: String,
  ChaveUnica: String, // Você não está usando, mas estava no JSON
  Status: String,
  deviceToken: String
});
const Guest = mongoose.model('Guest', GuestSchema); // 'Guest' vira a coleção 'guests'

const RsvpSchema = new mongoose.Schema({
  timestamp: Date,
  nome: String,
  guests: String,
  phone: String,
  message: String
});
const Rsvp = mongoose.model('Rsvp', RsvpSchema);

const GiftSchema = new mongoose.Schema({
  timestamp: Date,
  nome: String,
  gifts: [String] // Um array de strings
});
const Gift = mongoose.model('Gift', GiftSchema);

const ComprovativoSchema = new mongoose.Schema({
  timestamp: Date,
  nome: String,
  canal: String,
  fileName: String,
  originalName: String
});
const Comprovativo = mongoose.model('Comprovativo', ComprovativoSchema);

// 5. Configurar o Multer (Sem alteração na lógica, mas veja o AVISO no final)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    // ... (lógica do fs.existsSync ainda é necessária aqui)
    // AVISO: Isso NÃO funcionará bem em hospedagem (veja nota final)
    cb(null, uploadDir); 
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

/*
  FUNÇÕES UTILITÁRIAS (NÃO SÃO MAIS NECESSÁRIAS)
  As funções readDb e writeDb foram removidas.
*/

/*
  ROTAS DA API (MODIFICADAS PARA ASYNC)
*/

// Rota dos Convidados (JSON)
// Adicionamos 'async' pois vamos esperar o banco de dados
app.post('/api', async (req, res) => {
  const data = req.body;
  try {
    // MODIFICADO: As funções agora são 'async'
    if (data.action === "login") return await handleLogin(req, res);
    if (data.action === "rsvp") return await handleRsvp(req, res);
    if (data.action === "save_gifts") return await handleSaveGifts(req, res);
    return res.status(400).json({ status: "error", message: "Ação não reconhecida." });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Erro no servidor: " + error.message });
  }
});

// Rota de Upload de Comprovativos (Form-Data)
// Adicionamos 'async'
app.post('/api/upload_comprovativo', upload.single('comprovativoFile'), async (req, res) => {
  try {
    const { nome, canal } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ status: "error", message: "Ficheiro não recebido." });
    }

    // REMOVIDO: readDb(COMPROVATIVOS_DB_PATH);

    const newEntry = {
      timestamp: new Date(),
      nome: nome,
      canal: canal,
      fileName: file.filename,
      originalName: file.originalname
    };

    // NOVO: Salva no MongoDB
    await Comprovativo.create(newEntry);

    // REMOVIDO: writeDb(COMPROVATIVOS_DB_PATH, allComprovativos);

    return res.status(200).json({ status: "success", message: "Comprovativo enviado!" });

  } catch (error) {
    res.status(500).json({ status: "error", message: "Erro no servidor ao processar o upload: " + error.message });
  }
});


// Rota do Admin (Painel de Gestão)
// Adicionamos 'async'
app.post('/admin-api', async (req, res) => {
  const data = req.body;

  if (data.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ status: "error", message: "Senha de admin incorreta." });
  }

  try {
    if (data.action === "get_rsvps") {
      // NOVO: Busca no MongoDB e ordena
      const rsvps = await Rsvp.find().sort({ timestamp: -1 });
      return res.status(200).json({ status: "success", data: rsvps });
    }
    
    if (data.action === "get_gifts") {
      // NOVO: Busca no MongoDB e ordena
      const gifts = await Gift.find().sort({ timestamp: -1 });
      return res.status(200).json({ status: "success", data: gifts });
    }
    
    if (data.action === "get_comprovativos") {
      // NOVO: Busca no MongoDB e ordena
      const comprovativos = await Comprovativo.find().sort({ timestamp: -1 });
      return res.status(200).json({ status: "success", data: comprovativos });
    }

    return res.status(400).json({ status: "error", message: "Ação de admin não reconhecida." });

  } catch (error) {
    return res.status(500).json({ status: "error", message: "Erro no servidor admin: " + error.message });
  }
});


/*
  FUNÇÕES DE LÓGICA (Handlers) - TOTALMENTE REESCRITAS
*/

// --- Função de Login (MODIFICADA PARA MONGODB) ---
async function handleLogin(req, res) {
  const { name, loginToken } = req.body;

  if (!name || !loginToken) {
    return res.status(400).json({ status: "error", message: "Dados incompletos." });
  }

  // NOVO: Procura o convidado no MongoDB
  // Usamos uma RegEx para 'i' (case-insensitive) e trim
  const foundGuest = await Guest.findOne({ 
    Nome: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
  });
  
  if (!foundGuest) {
    // Convidado não encontrado
    return res.status(401).json({ status: "error", message: "Nome não encontrado na lista." });
  }

  // Convidado encontrado, verificar o token
  
  // CASO 1: Primeiro login (deviceToken está null)
  if (!foundGuest.deviceToken || foundGuest.deviceToken === null) {
    foundGuest.deviceToken = loginToken;
    foundGuest.Status = "Convite Aberto";
    
    // NOVO: Salva as alterações no banco de dados
    await foundGuest.save();

    return res.status(200).json({ 
      status: "success", 
      guestName: foundGuest.Nome,
      guestStatus: foundGuest.Status 
    });
  }
  
  // CASO 2: Login subsequente (deviceToken já existe)
  if (foundGuest.deviceToken === loginToken) {
    return res.status(200).json({ 
      status: "success", 
      guestName: foundGuest.Nome,
      guestStatus: foundGuest.Status 
    });
  }

  // CASO 3: Dispositivo diferente
  return res.status(403).json({ 
    status: "error",
    message: "Este convite já foi aberto noutro dispositivo." 
  });
}

// --- Função de RSVP (MODIFICADA PARA MONGODB) ---
async function handleRsvp(req, res) {
  const data = req.body;
  
  const newRow = {
    timestamp: new Date(),
    nome: data.nome,
    guests: data.guests,
    phone: data.phone,
    message: data.message
  };

  // NOVO: Cria a entrada no MongoDB
  await Rsvp.create(newRow);

  try {
    // Atualiza o status em convidados.json para "Confirmado (X)"
    await updateGuestStatus(data.nome, `Confirmado (${data.guests})`);
  } catch (e) {
    console.error("Falha ao atualizar status do convidado:", e.message);
  }
  return res.status(200).json({ status: "success", message: "Confirmação recebida!" });
}

// --- Função de Atualizar Status (MODIFICADA PARA MONGODB) ---
async function updateGuestStatus(name, status) {
  const filter = { 
    Nome: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    // Só actualiza se o status for "Pendente" ou "Convite Aberto"
    // ou se o novo status for "Confirmado" (permitindo atualizações)
    $or: [
      { Status: 'Pendente' },
      { Status: 'Convite Aberto' },
      { Status: { $regex: /^Confirmado/ } } // Permite re-confirmar
    ]
  };

  const update = {
    $set: { Status: status }
  };

  // NOVO: Busca e atualiza o convidado no MongoDB
  // findOneAndUpdate é uma operação atômica
  await Guest.findOneAndUpdate(filter, update);
}

// --- Função de Salvar Presentes (MODIFICADA PARA MONGODB) ---
async function handleSaveGifts(req, res) {
  const { nome, selectedGifts } = req.body;
  if (!nome || !selectedGifts) {
    return res.status(400).json({ status: "error", message: "Dados incompletos." });
  }

  const filter = { 
    nome: { $regex: new RegExp(`^${nome.trim()}$`, 'i') } 
  };
  
  const update = {
    $set: {
      timestamp: new Date(),
      nome: nome, // Garante a capitalização correta
      gifts: selectedGifts
    }
  };

  // NOVO: Busca e atualiza (ou cria se não existir = upsert)
  // Isso substitui a lógica de "findIndex"
  await Gift.findOneAndUpdate(filter, update, { upsert: true, new: true });

  return res.status(200).json({ status: "success", message: "Presentes registados!" });
}

// Rota GET para testes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota para servir os uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 4. Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});