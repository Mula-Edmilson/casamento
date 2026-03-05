// 1. Importar as ferramentas
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer'); 
const mongoose = require('mongoose'); 
require('dotenv').config(); 

// --- Configuração do Cloudinary ---
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'casamento-comprovativos',
    format: async (req, file) => 'jpg',
    public_id: (req, file) => `${req.body.nome.replace(/\s+/g, '-')}-${Date.now()}`
  }
});
const cloudinaryUpload = multer({ storage: cloudinaryStorage });

// 2. Configurar o servidor
const app = express();
app.use(express.json());
app.use(express.static(__dirname)); // Serve ficheiros estáticos (HTML, CSS)
app.use(cors());

const PORT = process.env.PORT || 3000; 
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; 

// 3. Conectar ao MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Conectado ao MongoDB Atlas com sucesso!");
    initializeGiftItems();
  })
  .catch(err => console.error("Erro ao conectar ao MongoDB:", err));

// 4. Definir os "Modelos" (Schemas)
const GuestSchema = new mongoose.Schema({
  Nome: String,
  ChaveUnica: String,
  Status: String,
  deviceToken: String,
  Mesa: String,
  Acompanhantes: { type: Number, default: 0 }
});
const Guest = mongoose.model('Guest', GuestSchema); 

const RsvpSchema = new mongoose.Schema({
  timestamp: Date,
  nome: String,
  guests: Number,
  phone: String,
  message: String,
  mesa: String
});
const Rsvp = mongoose.model('Rsvp', RsvpSchema);

// Gift Schema for reservation system
const GiftItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  reserved: {
    type: Boolean,
    default: false
  },
  reservedBy: {
    type: String,
    default: null
  },
  reservedAt: {
    type: Date,
    default: null
  },
  category: {
    type: String,
    default: 'Geral'
  }
});
const GiftItem = mongoose.model('GiftItem', GiftItemSchema);

// Legacy Gift schema for backward compatibility
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

const MessageSchema = new mongoose.Schema({
  timestamp: Date,
  nome: String,
  message: String
});
const Message = mongoose.model('Message', MessageSchema);

/*
  FUNÇÃO HELPER (Para ignorar acentos)
*/
const normalize = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
};

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

// Rota para buscar detalhes de UM convidado
app.all('/api/get-guest-details', async (req, res) => {
  try {
    const nome = req.body?.nome || req.query?.nome;

    if (!nome) {
      return res.status(400).json({
        status: "error",
        message: "Nome não fornecido."
      });
    }

    const inputClean = normalize(nome);
    const allGuests = await Guest.find();

    let foundGuest = null;

    for (const guest of allGuests) {
      if (normalize(guest.Nome) === inputClean) {
        foundGuest = guest;
        break;
      }
    }

    if (!foundGuest) {
      return res.status(404).json({
        status: "error",
        message: "Convidado não encontrado."
      });
    }

    return res.status(200).json({
      status: "success",
      maxGuestsTotal: Number(foundGuest.Acompanhantes) || 1
    });

  } catch (error) {
    console.error("Erro em /api/get-guest-details:", error);
    return res.status(500).json({
      status: "error",
      message: "Erro no servidor."
    });
  }
});

// GET /api/gifts - Return all available gifts
app.get('/api/gifts', async (req, res) => {
  try {
    const gifts = await GiftItem.find().sort({ name: 1 });
    return res.status(200).json({
      status: "success",
      data: gifts
    });
  } catch (error) {
    console.error("Erro ao buscar presentes:", error);
    return res.status(500).json({
      status: "error",
      message: "Erro ao carregar lista de presentes"
    });
  }
});

// Rota de Upload de Comprovativos
app.post('/api/upload_comprovativo', cloudinaryUpload.single('comprovativoFile'), async (req, res) => {
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
      return res.status(200).json({ status: "success", data: rsvps });
    }
    if (data.action === "get_gifts") {
      const gifts = await Gift.find().sort({ timestamp: -1 });
      return res.status(200).json({ status: "success", data: gifts });
    }
    if (data.action === "get_gift_items") {
      const giftItems = await GiftItem.find().sort({ name: 1 });
      return res.status(200).json({ status: "success", data: giftItems });
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
  FUNÇÕES DE LÓGICA (HANDLERS)
*/

// --- Função de Login ---
async function handleLogin(req, res) {
  const { name, loginToken } = req.body;
  if (!name || !loginToken) {
    return res.status(400).json({ status: "error", message: "Dados incompletos." });
  }

  const inputClean = normalize(name);

  const allGuests = await Guest.find();
  let foundGuest = null;
  
  for (const guest of allGuests) {
    if (normalize(guest.Nome) === inputClean) {
      foundGuest = guest;
      break; 
    }
  }

  if (foundGuest) {
    if (!foundGuest.deviceToken || foundGuest.deviceToken === null) {
      foundGuest.deviceToken = loginToken;
      foundGuest.Status = "Convite Aberto";
      await foundGuest.save();
      
      return res.status(200).json({
        status: "success",
        guestName: foundGuest.Nome,
        guestStatus: foundGuest.Status,
        Mesa: foundGuest.Mesa || 'A definir',
        maxGuestsTotal: Number(foundGuest.Acompanhantes) || 1 
      });
    }

    if (foundGuest.deviceToken === loginToken) {
      return res.status(200).json({
        status: "success",
        guestName: foundGuest.Nome,
        guestStatus: foundGuest.Status,
        Mesa: foundGuest.Mesa || 'A definir',
        maxGuestsTotal: Number(foundGuest.Acompanhantes) || 1
      });
    }

    return res.status(403).json({
      status: "error",
      message: "Este convite já foi aberto noutro dispositivo."
    });

  } else {
    return res.status(401).json({ status: "error", message: "Nome não encontrado na lista." });
  }
}

// --- Função de RSVP ---
async function handleRsvp(req, res) {
  const data = req.body;
  
  const nameClean = normalize(data.nome);
  const allGuests = await Guest.find();
  const guest = allGuests.find(g => normalize(g.Nome) === nameClean);
  const mesa = guest ? guest.Mesa : "A definir";

  const acompanhantes = guest ? Number(guest.Acompanhantes) : 0;
const totalGuests = 1 + acompanhantes;

const newRow = {
  timestamp: new Date(),
  nome: data.nome,
  guests: totalGuests,
  phone: data.phone,
  message: data.message,
  mesa: mesa
};
  await Rsvp.create(newRow);

  try {
    if (guest) {
      guest.Status = `Confirmado (${totalGuests})`;
      await guest.save();
    }
  } catch (e) {
    console.error("Falha ao atualizar status do convidado:", e.message);
  }
  
  return res.status(200).json({ status: "success", message: "Confirmação recebida!" });
}

// Initialize gift items after MongoDB connection
async function initializeGiftItems() {
  try {
    const giftList = [
      "Geleira", "Fogão", "Congelador", "TV", "Batedeira", 
      "Mesa", "Cadeira", "Panela", "Ar Condicionado", "Micro-ondas",
      "Ferro a vapor", "Mesa de centro", "Vaso", "Pratos", "Colcha",
      "Cobertor", "Colchão", "Forno elétrico", "Jogo de facas", 
      "Máquina de lavar", "Tapete", "Saladeira", "Panela de pressão",
      "Porta-temperos", "Copos", "Fritadeira elétrica", "Bandeja",
      "Torradeira", "Frigideira electrica"
    ];

    for (const giftName of giftList) {
      await GiftItem.findOneAndUpdate(
        { name: giftName },
        {
          $setOnInsert: {
            name: giftName,
            reserved: false,
            reservedBy: null,
            reservedAt: null,
            category: "Geral"
          }
        },
        { upsert: true }
      );
    }
    console.log("🎁 Lista de presentes inicializada com sucesso!");
  } catch (error) {
    console.error("Erro ao inicializar presentes:", error);
  }
}

// --- Função de Salvar Presentes (atualizada com atomic operations) ---
async function handleSaveGifts(req, res) {
  const { nome, selectedGifts } = req.body;
  
  if (!nome || !selectedGifts || !Array.isArray(selectedGifts)) {
    return res.status(400).json({
      status: "error",
      message: "Dados incompletos ou inválidos."
    });
  }

  // Track results
  const results = {
    success: [],
    failed: []
  };

  // Process each gift with atomic operation
  for (const giftName of selectedGifts) {
    try {
      // Atomic update - only succeeds if gift is not reserved
      const updatedGift = await GiftItem.findOneAndUpdate(
        {
          name: giftName,
          reserved: false
        },
        {
          reserved: true,
          reservedBy: nome,
          reservedAt: new Date()
        },
        { new: true }
      );

      if (updatedGift) {
        results.success.push(giftName);
      } else {
        // Check if gift exists but is reserved
        const existingGift = await GiftItem.findOne({ name: giftName });
        if (existingGift && existingGift.reserved) {
          results.failed.push({
            gift: giftName,
            reason: `Já reservado por ${existingGift.reservedBy}`
          });
        } else {
          results.failed.push({
            gift: giftName,
            reason: "Presente não encontrado"
          });
        }
      }
    } catch (error) {
      console.error(`Erro ao reservar ${giftName}:`, error);
      results.failed.push({
        gift: giftName,
        reason: "Erro no servidor"
      });
    }
  }

  // Save to legacy Gift collection for backward compatibility
  if (results.success.length > 0) {
    try {
      const filter = { nome: { $regex: new RegExp(`^${nome.trim()}$`, 'i') } };
      const update = {
        $set: {
          timestamp: new Date(),
          nome: nome,
          gifts: results.success
        }
      };
      await Gift.findOneAndUpdate(filter, update, { upsert: true, new: true });
    } catch (e) {
      console.error("Erro ao salvar no legacy Gift:", e.message);
    }
  }

  // Return response
  if (results.success.length > 0) {
    return res.status(200).json({
      status: "success",
      message: results.failed.length === 0 
        ? "Presentes reservados com sucesso!" 
        : `${results.success.length} presente(s) reservado(s), ${results.failed.length} falhou(aram).`,
      data: results
    });
  } else {
    return res.status(409).json({
      status: "error",
      message: "Nenhum presente pôde ser reservado. Todos já foram selecionados.",
      data: results
    });
  }
}

// --- Função de Salvar Mensagens ---
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
app.get('/convite.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'convite.html'));
});
app.get('/ja-aberto.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'ja-aberto.html'));
});
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// 6. Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
