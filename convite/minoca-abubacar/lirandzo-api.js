// lirandzo-api.js
// Cliente para a API da Lirandzo (Google Apps Script)

const LIRANDZO_API = {
  // URL base da API
  BASE_URL: "https://api-casamento-mj.onrender.com/api",
  
  // Token de admin (será preenchido após login)
  ADMIN_TOKEN: null,
  
  /**
   * Requisição JSONP para GET
   */
  async jsonpRequest(url) {
    return new Promise((resolve, reject) => {
      const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
      
      window[callbackName] = function(data) {
        delete window[callbackName];
        document.body.removeChild(script);
        resolve(data);
      };

      const script = document.createElement('script');
      const separator = url.includes('?') ? '&' : '?';
      script.src = url + separator + 'callback=' + callbackName;
      
      script.onerror = function(error) {
        delete window[callbackName];
        document.body.removeChild(script);
        reject(new Error('JSONP request failed'));
      };
      
      document.body.appendChild(script);
    });
  },

  /**
   * Requisição POST com no-cors
   */
  async postRequest(data) {
    try {
      const response = await fetch(this.BASE_URL, {
        method: "POST",
        mode: 'cors',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, slug: window.LIRANDZO_INVITE_SLUG || "minoca-abubacar" })
      });
      return { status: "success" };
    } catch (err) {
      console.error("Erro na requisição POST:", err);
      throw err;
    }
  },

  /**
   * Autenticar admin
   */
  async authenticateAdmin(password) {
    try {
      const result = await this.jsonpRequest(`${this.BASE_URL}?action=auth_admin&password=${encodeURIComponent(password)}`);
      return result;
    } catch (error) {
      console.error('Erro na autenticação:', error);
      return { status: 'error', message: 'Erro de conexão' };
    }
  },

  /**
   * Buscar todos os RSVPs
   */
  async getRSVPs() {
    try {
      const result = await this.jsonpRequest(`${this.BASE_URL}?action=get_rsvps&admin_token=${this.ADMIN_TOKEN || ''}`);
      return result;
    } catch (error) {
      console.error('Erro ao buscar RSVPs:', error);
      return { status: 'error', data: [] };
    }
  },

  /**
   * Buscar todos os presentes registrados
   */
  async getGifts() {
    try {
      const result = await this.jsonpRequest(`${this.BASE_URL}?action=get_gifts&admin_token=${this.ADMIN_TOKEN || ''}`);
      return result;
    } catch (error) {
      console.error('Erro ao buscar presentes:', error);
      return { status: 'error', data: [] };
    }
  },

  /**
   * Buscar todos os comprovativos
   */
  async getComprovativos() {
    try {
      const result = await this.jsonpRequest(`${this.BASE_URL}?action=get_comprovativos&admin_token=${this.ADMIN_TOKEN || ''}`);
      return result;
    } catch (error) {
      console.error('Erro ao buscar comprovativos:', error);
      return { status: 'error', data: [] };
    }
  },

  /**
   * Buscar todas as mensagens
   */
  async getMessages() {
    try {
      const result = await this.jsonpRequest(`${this.BASE_URL}?action=get_messages&admin_token=${this.ADMIN_TOKEN || ''}`);
      return result;
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error);
      return { status: 'error', data: [] };
    }
  },

  /**
   * Buscar lista de presentes (inventário)
   */
  async getGiftInventory() {
    try {
      const result = await this.jsonpRequest(`${this.BASE_URL}?action=gifts&admin_token=${this.ADMIN_TOKEN || ''}`);
      return result;
    } catch (error) {
      console.error('Erro ao buscar inventário:', error);
      return { status: 'error', data: [] };
    }
  },

  /**
   * Buscar todos os convidados
   */
  async getGuests() {
    try {
      const result = await this.jsonpRequest(`${this.BASE_URL}?action=get_guests&admin_token=${this.ADMIN_TOKEN || ''}`);
      return result;
    } catch (error) {
      console.error('Erro ao buscar convidados:', error);
      return { status: 'error', data: [] };
    }
  },

  /**
   * Atualizar mesa de um convidado
   */
  async updateGuestTable(token, mesa) {
    return this.postRequest({
      action: 'update_guest_table',
      admin_token: this.ADMIN_TOKEN,
      token: token,
      mesa: mesa
    });
  },

  /**
   * Buscar estatísticas
   */
  async getStats() {
    try {
      const result = await this.jsonpRequest(`${this.BASE_URL}?action=get_stats&admin_token=${this.ADMIN_TOKEN || ''}`);
      return result;
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      return { status: 'error', data: {} };
    }
  }
};