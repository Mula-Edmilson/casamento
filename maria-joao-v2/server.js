// 1. Importar as ferramentas
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const multer = require('multer'); 
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// 2. Configurar o servidor
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// 3. Conectar ao MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Conectado ao MongoDB Atlas com sucesso!"))
  .catch(err => console.error("Erro ao conectar ao MongoDB:", err));

// 4. Definir os "Modelos" (Schemas)

const GuestSchema = new mongoose.Schema({
  Nome: String,
  ChaveUnica: String,
  Status: String,
  deviceToken: String,
  Mesa: String // <-- Campo para o nome/número da mesa
});
const Guest = mongoose.model('Guest', GuestSchema);

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
  gifts: [String]
});
const Gift = mongoose.model('Gift', GiftSchema);

const ComprovativoSchema = new mongoose.Schema({
  timestamp: Date,
  nome: String,
  canal: String,
  fileName: String,
  originalName: String,
  public_id: String
});
const Comprovativo = mongoose.model('Comprovativo', ComprovativoSchema);

const MessageSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  nome: String,
  message: String
});
const Message = mongoose.model('Message', MessageSchema);


// 5. Configurar o Cloudinary e o Multer
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'comprovativos-casamento',
    format: async (req, file) => 'jpg',
    public_id: (req, file) => `${Date.now()}-${file.originalname.split('.')[0]}`
  }
});
const upload = multer({ storage: storage });


/*
  ==============================================
  ROTAS DA API
  ==============================================
*/

// Rota dos Convidados (JSON)
app.post('/api', async (req, res) => {
  const data = req.body;
  try {
    if (data.action === "login") return await handleLogin(req, res);
    if (data.action === "rsvp") return await handleRsvp(req, res);
    if (data.action === "save_gifts") return await handleSaveGifts(req, res);
    if (data.action === "post_message") return await handlePostMessage(req, res);
    
    return res.status(400).json({ status: "error", message: "Ação não reconhecida." });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Erro no servidor: " + error.message });
  }
});

// Rota para BUSCAR mensagens (Público)
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: -1 });
    return res.status(200).json({ status: "success", data: messages });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Erro ao buscar mensagens: " + error.message });
  }
});


// Rota de Upload de Comprovativos
app.post('/api/upload_comprovativo', upload.single('comprovativoFile'), async (req, res) => {
  try {
    const { nome, canal } = req.body;
    const file = req.file;
    if (!file) {
      return res.status(400).json({ status: "error", message: "Ficheiro não recebido." });
    }
    const newEntry = {
      timestamp: new Date(),
      nome: nome,
      canal: canal,
      fileName: file.path,
      originalName: file.originalname,
      public_id: file.filename
    };
    await Comprovativo.create(newEntry);
    return res.status(200).json({ status: "success", message: "Comprovativo enviado!" });
  } catch (error) {
    console.error("Erro no upload:", error);
    res.status(500).json({ status: "error", message: "Erro no servidor ao processar o upload: " + error.message });
  }
});


// Rota do Admin (Painel de Gestão)
app.post('/admin-api', async (req, res) => {
  const data = req.body;
  if (data.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ status: "error", message: "Senha de admin incorreta." });
  }

  try {
    // ================== LÓGICA DE GET_RSVPS ATUALIZADA ==================
    if (data.action === "get_rsvps") {
      // 1. Buscar todos os RSVPs (confirmações)
      const rsvps = await Rsvp.find().sort({ timestamp: -1 }).lean(); // .lean() para objetos JS puros

      // 2. Buscar todos os convidados (apenas Nome e Mesa)
      const allGuests = await Guest.find().select('Nome Mesa').lean();

      // 3. Criar um Mapa para consulta rápida (Nome em minúsculas -> Mesa)
      const guestMesaMap = new Map();
      allGuests.forEach(guest => {
        guestMesaMap.set(guest.Nome.toLowerCase(), guest.Mesa);
      });

      // 4. Juntar os dados: adicionar a 'mesa' a cada 'rsvp'
      const populatedRsvps = rsvps.map(rsvp => {
        const rsvpNameLower = rsvp.nome.toLowerCase();
        return {
          ...rsvp, // Mantém todos os dados do RSVP (nome, data, convidados, etc.)
          mesa: guestMesaMap.get(rsvpNameLower) || 'A definir' // Adiciona a mesa
        };
      });
      
      return res.status(200).json({ status: "success", data: populatedRsvps });
    }
    // ====================================================================
    
    if (data.action === "get_gifts") {
      const gifts = await Gift.find().sort({ timestamp: -1 });
      return res.status(200).json({ status: "success", data: gifts });
    }
    
    if (data.action === "get_comprovativos") {
      const comprovativos = await Comprovativo.find().sort({ timestamp: -1 });
      return res.status(200).json({ status: "success", data: comprovativos });
    }
    
    if (data.action === "get_messages") {
      const messages = await Message.find().sort({ timestamp: -1 });
      return res.status(200).json({ status: "success", data: messages });
    }
    
    return res.status(400).json({ status: "error", message: "Ação de admin não reconhecida." });

  } catch (error) {
    return res.status(500).json({ status: "error", message: "Erro no servidor admin: " + error.message });
  }
});


/*
  ==============================================
  FUNÇÕES DE LÓGICA (Handlers)
  ==============================================
*/

// --- Função de Login ---
async function handleLogin(req, res) {
  const { name, loginToken } = req.body;
  if (!name || !loginToken) {
    return res.status(400).json({ status: "error", message: "Dados incompletos." });
  }
  const foundGuest = await Guest.findOne({ 
    Nome: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
  });
  if (!foundGuest) {
    return res.status(401).json({ status: "error", message: "Nome não encontrado na lista." });
  }
  
  if (!foundGuest.deviceToken || foundGuest.deviceToken === null) {
    foundGuest.deviceToken = loginToken;
    foundGuest.Status = "Convite Aberto";
    await foundGuest.save();

    return res.status(200).json({ 
      status: "success", 
      guestName: foundGuest.Nome,
      guestStatus: foundGuest.Status,
      Mesa: foundGuest.Mesa // <-- Dado da Mesa enviado (Correto!)
    });
  }
  
  if (foundGuest.deviceToken === loginToken) {
    return res.status(200).json({ 
      status: "success", 
      guestName: foundGuest.Nome,
      guestStatus: foundGuest.Status,
      Mesa: foundGuest.Mesa // <-- Dado da Mesa enviado (Correto!)
    });
  }
  
  return res.status(403).json({ 
    status: "error",
    message: "Este convite já foi aberto noutro dispositivo." 
  });
}

// --- Função de RSVP ---
async function handleRsvp(req, res) {
  const data = req.body;
  const newRow = {
    timestamp: new Date(),
    nome: data.nome,
    guests: data.guests,
    phone: data.phone,
    message: data.message
  };
  await Rsvp.create(newRow);
  try {
    await updateGuestStatus(data.nome, `Confirmado (${data.guests})`);
  } catch (e) {
    console.error("Falha ao atualizar status do convidado:", e.message);
  }
  return res.status(200).json({ status: "success", message: "Confirmação recebida!" });
}

// --- Função de Atualizar Status ---
async function updateGuestStatus(name, status) {
  const filter = { 
    Nome: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    $or: [
      { Status: 'Pendente' },
      { Status: 'Convite Aberto' },
      { Status: { $regex: /^Confirmado/ } }
    ]
  };
  const update = {
    $set: { Status: status }
  };
  await Guest.findOneAndUpdate(filter, update);
}

// --- Função de Salvar Presentes ---
async function handleSaveGifts(req, res) {
  const { nome, selectedGifts } = req.body;
  if (!nome || !selectedGifts) {
    return res.status(400).json({ status: "error", message: "Dados incompletos." });
  }
  const filter = { 
    nome: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
  };
  const update = {
    $set: {
      timestamp: new Date(),
      nome: nome,
      gifts: selectedGifts
    }
  };
  await Gift.findOneAndUpdate(filter, update, { upsert: true, new: true });
  return res.status(200).json({ status: "success", message: "Presentes registados!" });
}

// --- Função de Postar Mensagem ---
async function handlePostMessage(req, res) {
  const { nome, message } = req.body;
  if (!nome || !message) {
    return res.status(400).json({ status: "error", message: "Nome e mensagem são obrigatórios." });
  }
  if (message.length > 500) {
      return res.status(400).json({ status: "error", message: "Mensagem muito longa (máx 500 caracteres)." });
  }
  const newMessage = new Message({
    timestamp: new Date(),
    nome: nome,
    message: message
  });
  await newMessage.save();
  return res.status(201).json({ status: "success", message: "Mensagem enviada!", data: newMessage });
}


// Rota GET para o front-end
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 4. Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});