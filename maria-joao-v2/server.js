// 1. Importar as ferramentas
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer'); 
const mongoose = require('mongoose'); 
require('dotenv').config(); 

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
  Mesa: String // Adicionado campo Mesa
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
  originalName: String
});
const Comprovativo = mongoose.model('Comprovativo', ComprovativoSchema);

// Novo Schema para Mensagens do Mural
const MessageSchema = new mongoose.Schema({
  timestamp: Date,
  nome: String,
  message: String
});
const Message = mongoose.model('Message', MessageSchema);

// 5. Configurar o Multer (Uploads)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    // Nota: Em servidores como Render, esta pasta é temporária.
    // Para produção ideal, usaria Cloudinary, mas isto funciona para o básico.
    cb(null, uploadDir); 
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

/*
  ROTAS DA API
*/

// Rota Principal (POST)
app.post('/api', async (req, res) => {
  const data = req.body;
  try {
    if (data.action === "login") return await handleLogin(req, res);
    if (data.action === "rsvp") return await handleRsvp(req, res);
    if (data.action === "save_gifts") return await handleSaveGifts(req, res);
    if (data.action === "post_message") return await handlePostMessage(req, res);
    return res.status(400).json({ status: "error", message: "Ação não reconhecida." });
  } catch (error) {
    console.error("Erro na API:", error);
    return res.status(500).json({ status: "error", message: "Erro no servidor: " + error.message });
  }
});

// Rota para Ler Mensagens (GET)
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: -1 });
    res.status(200).json({ status: "success", data: messages });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Erro ao buscar mensagens." });
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
      fileName: file.filename,
      originalName: file.originalname
    };

    await Comprovativo.create(newEntry);

    return res.status(200).json({ status: "success", message: "Comprovativo enviado!" });

  } catch (error) {
    res.status(500).json({ status: "error", message: "Erro no servidor ao processar o upload: " + error.message });
  }
});

// Rota do Admin
app.post('/admin-api', async (req, res) => {
  const data = req.body;

  if (data.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ status: "error", message: "Senha de admin incorreta." });
  }

  try {
    if (data.action === "get_rsvps") {
      const rsvps = await Rsvp.find().sort({ timestamp: -1 });
      // Enriquecer RSVP com a Mesa do convidado
      const enrichedRsvps = await Promise.all(rsvps.map(async (rsvp) => {
         const guest = await Guest.findOne({ Nome: { $regex: new RegExp(`^${rsvp.nome.trim()}$`, 'i') } });
         return { ...rsvp.toObject(), mesa: guest ? guest.Mesa : "Desconhecida" };
      }));
      return res.status(200).json({ status: "success", data: enrichedRsvps });
    }
    
    if (data.action === "get_gifts") {
      const gifts = await Gift.find().sort({ timestamp: -1 });
      return res.status(200).json({ status: "success", data: gifts });
    }
    
    if (data.action === "get_comprovativos") {
      const comprovativos = await Comprovativo.find().sort({ timestamp: -1 });
      // Adiciona o caminho completo para o link funcionar no admin
      const mappedComprovativos = comprovativos.map(c => ({
        ...c.toObject(),
        fileName: `/uploads/${c.fileName}` 
      }));
      return res.status(200).json({ status: "success", data: mappedComprovativos });
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
  FUNÇÕES DE LÓGICA (HANDLERS)
*/

// --- Função de Login (Versão Robusta / Tolerante a Nomes) ---
async function handleLogin(req, res) {
  const { name, loginToken } = req.body;
  
  if (!name || !loginToken) {
    return res.status(400).json({ status: "error", message: "Dados incompletos." });
  }

  // Normaliza: minúsculas, sem acentos, sem espaços extra
  const normalize = (str) => {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  };

  const inputClean = normalize(name); 

  // Caso 1: Re-login
  let foundGuest = await Guest.findOne({ deviceToken: loginToken });

  if (foundGuest) {
    const dbNameClean = normalize(foundGuest.Nome);
    const isMatch = inputClean === dbNameClean || inputClean.startsWith(dbNameClean + " ");

    if (isMatch) {
      return res.status(200).json({
        status: "success",
        guestName: foundGuest.Nome,
        guestStatus: foundGuest.Status,
        Mesa: foundGuest.Mesa
      });
    } else {
      return res.status(403).json({
        status: "error",
        message: "Este convite já foi aberto noutro dispositivo."
      });
    }
  }

  // Caso 2: Login Novo (apenas em quem deviceToken é null)
  const pendingGuests = await Guest.find({ deviceToken: null });
  let bestMatch = null;

  for (const guest of pendingGuests) {
    const dbNameClean = normalize(guest.Nome);
    
    // Se input contém o nome da BD (ex: input "Joao Silva" contém "Joao")
    if (inputClean === dbNameClean || inputClean.startsWith(dbNameClean + " ")) {
      // Escolhe a correspondência mais longa da BD para evitar falsos positivos curtos
      if (!bestMatch || dbNameClean.length > normalize(bestMatch.Nome).length) {
        bestMatch = guest;
      }
    }
  }

  if (bestMatch) {
    bestMatch.deviceToken = loginToken;
    bestMatch.Status = "Convite Aberto";
    await bestMatch.save();

    return res.status(200).json({
      status: "success",
      guestName: bestMatch.Nome, 
      guestStatus: bestMatch.Status,
      Mesa: bestMatch.Mesa
    });
  }

  // Caso 3: Erro (Verifica se já foi usado por outro token)
  const allGuests = await Guest.find();
  const alreadyUsed = allGuests.find(g => {
      const dbNameClean = normalize(g.Nome);
      return (inputClean === dbNameClean || inputClean.startsWith(dbNameClean + " ")) && g.deviceToken;
  });

  if (alreadyUsed) {
    return res.status(403).json({
      status: "error",
      message: "Este convite já foi aberto noutro dispositivo."
    });
  }

  return res.status(401).json({ status: "error", message: "Nome não encontrado na lista." });
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
  // Normaliza para encontrar o convidado mesmo com acentos diferentes
  const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const nameClean = normalize(name);

  // Procura todos e filtra no JS para usar a mesma lógica robusta
  const allGuests = await Guest.find();
  const guestToUpdate = allGuests.find(g => normalize(g.Nome) === nameClean);

  if (guestToUpdate) {
    guestToUpdate.Status = status;
    await guestToUpdate.save();
  }
}

// --- Função de Salvar Presentes ---
async function handleSaveGifts(req, res) {
  const { nome, selectedGifts } = req.body;
  if (!nome || !selectedGifts) {
    return res.status(400).json({ status: "error", message: "Dados incompletos." });
  }

  const filter = { nome: { $regex: new RegExp(`^${nome.trim()}$`, 'i') } };
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

// --- Função de Salvar Mensagens (Mural) ---
async function handlePostMessage(req, res) {
    const { nome, message } = req.body;
    
    if (!nome || !message) {
        return res.status(400).json({ status: "error", message: "Dados incompletos." });
    }

    const newMsg = await Message.create({
        timestamp: new Date(),
        nome: nome,
        message: message
    });

    return res.status(200).json({ status: "success", data: newMsg });
}

// Rotas para Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 6. Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
