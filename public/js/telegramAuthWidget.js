/*
  TelegramAuthWidget - embeddable auth UI with callbacks
  UMD export: window.TelegramAuthWidget for browsers; module.exports for CommonJS
*/
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['./phoneMask'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./phoneMask'));
  } else {
    root.TelegramAuthWidget = factory(root.PhoneMaskHandler);
  }
}(typeof self !== 'undefined' ? self : this, function (PhoneMaskHandler) {
  class TelegramAuthWidget {
    constructor(options) {
      this.options = Object.assign({
        target: null,                 // HTMLElement or selector
        socket: null,                 // existing Socket.IO instance or null
        onAuthKey: () => {},          // ({ qrCode, link })
        onSmsSent: () => {},          // ({ phone })
        onAuthSuccess: () => {},      // ({ name, phone, sessionToken })
        onAuthError: () => {},        // ({ message })
        onStatus: () => {},           // (message, type)
        requestAuthLabel: 'Получить код',
        verifyCodeLabel: 'Проверить код'
      }, options || {});

      this.phoneMask = new PhoneMaskHandler();
      this._initSocket();
      this._render();
      this._bind();
    }

    _initSocket() {
      if (this.options.socket) {
        this.socket = this.options.socket;
      } else if (typeof io !== 'undefined') {
        this.socket = io();
      } else {
        throw new Error('Socket.IO is required');
      }
      this._bindSocket();
    }

    _bindSocket() {
      this.socket.on('authKey', (data) => this.options.onAuthKey(data));
      this.socket.on('smsCodeSent', (data) => this.options.onSmsSent(data));
      this.socket.on('authSuccess', (data) => this.options.onAuthSuccess(data));
      this.socket.on('authError', (data) => this.options.onAuthError(data));
    }

    _render() {
      const target = typeof this.options.target === 'string'
        ? document.querySelector(this.options.target)
        : this.options.target;
      if (!target) throw new Error('target not found');

      target.innerHTML = `
        <div class="space-y-4">
          <div class="relative">
            <input id="ta-phone" type="tel" inputmode="tel" autocomplete="tel"
              placeholder="+7 (___) ___-__-__"
              class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-10 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              pattern="^\\+7 \\([0-9]{3}\\) [0-9]{3}-[0-9]{2}-[0-9]{2}$"
              title="Формат: +7 (999) 123-45-67"
            />
            <button id="ta-clear" type="button" class="absolute inset-y-0 right-2 my-auto rounded-lg px-2 text-sm text-gray-500 hover:bg-gray-100">Очистить</button>
          </div>
          <div class="flex gap-2">
            <button id="ta-request" class="btn-primary w-full py-3 px-4 rounded-xl text-white font-semibold">${this.options.requestAuthLabel}</button>
            <input id="ta-code" type="text" maxlength="6" class="w-28 text-center rounded-xl border border-gray-300 px-2" placeholder="Код" />
            <button id="ta-verify" class="btn-secondary py-3 px-4 rounded-xl text-gray-800 font-medium">${this.options.verifyCodeLabel}</button>
          </div>
          <div id="ta-status" class="text-sm text-gray-600"></div>
        </div>
      `;
      this.el = {
        phone: target.querySelector('#ta-phone'),
        clear: target.querySelector('#ta-clear'),
        request: target.querySelector('#ta-request'),
        code: target.querySelector('#ta-code'),
        verify: target.querySelector('#ta-verify'),
        status: target.querySelector('#ta-status')
      };
    }

    _bind() {
      const { phone, clear, request, code, verify, status } = this.el;

      const showStatus = (msg, type='info') => {
        status.textContent = msg;
        this.options.onStatus(msg, type);
      };

      const applyMask = () => {
        const prev = phone.value;
        const start = phone.selectionStart;
        const caretIndex = (start === null ? prev.length : start);
        let digitIndexBefore = this.phoneMask.getDigitsCountUpTo(prev, caretIndex);
        const totalDigits = this.phoneMask.onlyDigits(prev).length;
        if (digitIndexBefore === 0 && totalDigits > 0) digitIndexBefore = totalDigits;
        const tight = this.phoneMask.formatAsRuPhoneTight(prev);
        const withMask = this.phoneMask.formatAsRuPhone(prev);
        const rawDigits = this.phoneMask.onlyDigits(prev).slice(0, 11);
        const complete = rawDigits.length === 11;
        phone.value = complete ? tight : withMask;
        const prevDigits = this.phoneMask.onlyDigits(prev);
        const skipInitialDigits = (prevDigits && prevDigits.length > 0 && prevDigits[0] !== '7') ? 1 : 0;
        const newCaret = this.phoneMask.caretFromDigitIndex(phone.value, digitIndexBefore, skipInitialDigits);
        phone.setSelectionRange(newCaret, newCaret);
      };

      phone.addEventListener('keydown', (e) => {
        const allowed = e.ctrlKey || e.metaKey || e.altKey || ['Backspace','Delete','ArrowLeft','ArrowRight','Home','End','Tab'].includes(e.key);
        if (allowed) return;
        if (!/\d/.test(e.key)) { e.preventDefault(); return; }
        const currentDigits = this.phoneMask.onlyDigits(phone.value);
        if (currentDigits.length >= 11) e.preventDefault();
      });

      phone.addEventListener('input', applyMask);
      phone.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text');
        const digits = this.phoneMask.onlyDigits(pasted);
        const start = phone.selectionStart || 0; const end = phone.selectionEnd || 0;
        const before = phone.value.slice(0, start); const after = phone.value.slice(end);
        phone.value = before + digits + after; applyMask();
      });

      phone.addEventListener('blur', () => {
        const d = this.phoneMask.onlyDigits(phone.value);
        if (!d.length) return;
        if (d.length < 11) phone.value = '';
        else phone.value = this.phoneMask.formatAsRuPhoneTight(d);
      });

      clear.addEventListener('click', () => { phone.value = ''; phone.focus(); });

      request.addEventListener('click', () => {
        const validation = this.phoneMask.validatePhone(phone.value);
        if (!validation.valid) { showStatus(validation.error, 'error'); phone.focus(); return; }
        this.socket.emit('requestAuth', { phone: validation.normalized });
        showStatus('Отправка запроса...', 'info');
      });

      verify.addEventListener('click', () => {
        const validation = this.phoneMask.validatePhone(phone.value);
        const codeValue = code.value.trim();
        if (!validation.valid) { showStatus(validation.error, 'error'); phone.focus(); return; }
        if (!codeValue) { showStatus('Пожалуйста, введите код', 'error'); code.focus(); return; }
        if (codeValue.length < 4) { showStatus('Код должен содержать минимум 4 цифры', 'error'); code.focus(); return; }
        this.socket.emit('verifyCode', { phone: validation.normalized, code: codeValue });
        showStatus('Проверка кода...', 'info');
      });
    }
  }

  return TelegramAuthWidget;
}));


