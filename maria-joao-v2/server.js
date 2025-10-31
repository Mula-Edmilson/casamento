// 1. Importar as ferramentas
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

// --- MUDANÇA: Ferramentas de Upload ---
const multer = require('multer'); 
const { CloudinaryStorage } = require('multer-storage-cloudinary'); // <-- NOVO
const cloudinary = require('cloudinary').v2; // <-- NOVO

// 2. Configurar o servidor
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname)); // Serve o index.html, convite.html, etc.
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
  deviceToken: String
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

// --- MUDANÇA: O Schema de Comprovativo agora guarda um URL ---
const ComprovativoSchema = new mongoose.Schema({
  timestamp: Date,
  nome: String,
  canal: String,
  fileName: String, // <-- MUDANÇA: Agora será o URL seguro do Cloudinary
  originalName: String,
  public_id: String // <-- MUDANÇA: Para podermos apagar do Cloudinary se necessário
});
const Comprovativo = mongoose.model('Comprovativo', ComprovativoSchema);


// 5. --- MUDANÇA: Configurar o Cloudinary e o Multer ---

// Configura o SDK do Cloudinary com as suas senhas (lidas do .env)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configura o *novo* armazenamento (storage)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'comprovativos-casamento', // Uma pasta no Cloudinary para organizar
    format: async (req, file) => 'jpg', // Converte tudo para JPG
    public_id: (req, file) => `${Date.now()}-${file.originalname.split('.')[0]}` // Nome do ficheiro
  }
});

// Substitui o multer antigo pelo novo
const upload = multer({ storage: storage });


/*
  ROTAS DA API
*/

// Rota dos Convidados (JSON)
app.post('/api', async (req, res) => {
  const data = req.body;
  try {
    if (data.action === "login") return await handleLogin(req, res);
    if (data.action === "rsvp") return await handleRsvp(req, res);
    if (data.action === "save_gifts") return await handleSaveGifts(req, res);
    return res.status(400).json({ status: "error", message: "Ação não reconhecida." });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Erro no servidor: " + error.message });
  }
});

// --- MUDANÇA: Rota de Upload de Comprovativos ---
app.post('/api/upload_comprovativo', upload.single('comprovativoFile'), async (req, res) => {
  try {
    const { nome, canal } = req.body;
    const file = req.file; // 'file' agora vem do Cloudinary

    if (!file) {
      return res.status(400).json({ status: "error", message: "Ficheiro não recebido." });
    }

    // 'file' agora contém 'path' (o URL) e 'filename' (o public_id)
    const newEntry = {
      timestamp: new Date(),
      nome: nome,
      canal: canal,
      fileName: file.path, // <-- MUDANÇA: Guardamos o URL seguro (ex: http://res.cloudinary.com/...)
      originalName: file.originalname,
      public_id: file.filename // <-- MUDANÇA: O ID para gestão
    };

    // Salva a entrada com o URL no MongoDB
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
    if (data.action === "get_rsvps") {
      const rsvps = await Rsvp.find().sort({ timestamp: -1 });
      return res.status(200).json({ status: "success", data: rsvps });
    }
    
    if (data.action === "get_gifts") {
      const gifts = await Gift.find().sort({ timestamp: -1 });
      return res.status(200).json({ status: "success", data: gifts });
    }
    
    if (data.action === "get_comprovativos") {
      const comprovativos = await Comprovativo.find().sort({ timestamp: -1 });
      return res.status(200).json({ status: "success", data: comprovativos });
    }

    return res.status(400).json({ status: "error", message: "Ação de admin não reconhecida." });

  } catch (error) {
    return res.status(500).json({ status: "error", message: "Erro no servidor admin: " + error.message });
  }
});


/*
  FUNÇÕES DE LÓGICA (Handlers) - Sem mudanças
*/

// --- Função de Login (MODIFICADA PARA MONGODB) ---
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
      guestStatus: foundGuest.Status 
    });
  }
  
  if (foundGuest.deviceToken === loginToken) {
    return res.status(200).json({ 
      status: "success", 
      guestName: foundGuest.Nome,
      guestStatus: foundGuest.Status 
    });
  }

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

  await Rsvp.create(newRow);

  try {
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
      nome: nome,
      gifts: selectedGifts
    }
  };

  await Gift.findOneAndUpdate(filter, update, { upsert: true, new: true });

  return res.status(200).json({ status: "success", message: "Presentes registados!" });
}

// Rota GET para testes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- MUDANÇA: A Rota de Uploads FOI REMOVIDA ---
// A linha 'app.use('/uploads', ...)' foi apagada porque já não é necessária.

// 4. Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});