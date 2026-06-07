// lirandzo-api.js
// Cliente DEMO offline para apresentação do convite no site.
// Não contém endpoints reais, tokens reais ou dados pessoais.

const LIRANDZO_API = {
  BASE_URL: "https://api-casamento-mj.onrender.com/api",
  ADMIN_TOKEN: null,

  async authenticateAdmin(password) {
    if (password === 'demo2026' || password === '123456') {
      this.ADMIN_TOKEN = 'DEMO_ADMIN_TOKEN';
      return { status: 'success', token: this.ADMIN_TOKEN };
    }
    return { status: 'error', message: 'Senha demo inválida' };
  },

  async getRSVPs() {
    return { status: 'success', data: [
      { nome: 'Convidado Demo', guests: 2, phone: '+258 84 000 0000', mesa: 'Mesa Demo', message: 'Confirmo a minha presença.', timestamp: new Date().toISOString() },
      { nome: 'Família Exemplo', guests: 4, phone: '+258 87 000 0000', mesa: 'Mesa Família', message: 'Será uma alegria participar.', timestamp: new Date(Date.now() - 86400000).toISOString() }
    ]};
  },

  async getGifts() {
    return { status: 'success', data: [
      { name: 'Jogo de pratos elegante', reserved: true, reserved_by: 'Convidado Demo' },
      { name: 'Conjunto de talheres', reserved: false, reserved_by: null },
      { name: 'Jogo de copos', reserved: false, reserved_by: null }
    ]};
  },

  async getGiftInventory() { return this.getGifts(); },

  async getComprovativos() {
    return { status: 'success', data: [
      { nome: 'Convidado Demo', canal: 'M-Pesa Demo', filename: 'comprovativo-demo.jpg', timestamp: new Date().toISOString(), url: '#' }
    ]};
  },

  async getMessages() {
    return { status: 'success', data: [
      { nome: 'Convidada Demo', message: 'Que este novo capítulo seja cheio de amor.', timestamp: new Date().toISOString() },
      { nome: 'Família Demo', message: 'Desejamos muitas bênçãos aos noivos.', timestamp: new Date(Date.now() - 43200000).toISOString() }
    ]};
  },

  async getGuests() {
    return { status: 'success', data: [
      { nome: 'Convidado Demo', token: 'demo-convidado', mesa: 'Mesa Demo', maxGuests: 2, status: 'Demo', checked_in: false },
      { nome: 'Família Exemplo', token: 'demo-familia', mesa: 'Mesa Família', maxGuests: 4, status: 'Demo', checked_in: true }
    ]};
  },

  async getStats() {
    return { status: 'success', data: { totalGuests: 6, confirmed: 2, pending: 1, giftsReserved: 1, messages: 2 } };
  },

  async postRequest(data) {
    console.log('[DEMO] Pedido simulado:', data);
    return { status: 'success', demo: true };
  },

  async updateGuestTable(token, mesa) {
    return { status: 'success', token, mesa, demo: true };
  },

  async jsonpRequest() {
    return { status: 'success', demo: true };
  }
};
