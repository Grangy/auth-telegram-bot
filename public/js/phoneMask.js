/*
  PhoneMaskHandler - reusable Russian phone mask with smart caret handling.
  UMD export: window.PhoneMaskHandler for browsers; module.exports for CommonJS
*/
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PhoneMaskHandler = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  class PhoneMaskHandler {
    constructor() {
      this.lastLength = 0;
    }

    onlyDigits(s) {
      return (s || '').replace(/\D/g, '');
    }

    formatAsRuPhone(rawDigits) {
      if (!rawDigits) return '+7 (___) ___-__-__';
      let d = this.onlyDigits(rawDigits);
      if (d[0] === '8') d = '7' + d.slice(1);
      if (d[0] === '9') d = '7' + d;
      if (d[0] && d[0] !== '7') d = '7' + d.slice(1);
      d = d.slice(0, 11);
      const country = '+7';
      const rest = d[0] === '7' ? d.slice(1) : d;
      const a = rest.slice(0, 3);
      const b = rest.slice(3, 6);
      const c = rest.slice(6, 8);
      const e = rest.slice(8, 10);
      const A = a.padEnd(3, '_');
      const B = b.padEnd(3, '_');
      const C = c.padEnd(2, '_');
      const E = e.padEnd(2, '_');
      return `${country} (${A}) ${B}-${C}-${E}`;
    }

    formatAsRuPhoneTight(rawDigits) {
      let d = this.onlyDigits(rawDigits);
      if (d[0] === '8') d = '7' + d.slice(1);
      if (d[0] === '9') d = '7' + d;
      if (d[0] && d[0] !== '7') d = '7' + d.slice(1);
      d = d.slice(0, 11);
      const country = '+7';
      const rest = d[0] === '7' ? d.slice(1) : d;
      const a = rest.slice(0, 3);
      const b = rest.slice(3, 6);
      const c = rest.slice(6, 8);
      const e = rest.slice(8, 10);
      let out = `${country}`;
      if (a) out += ` (${a}`;
      if (a.length === 3) out += `)`;
      if (b) out += ` ${b}`;
      if (c) out += `-${c}`;
      if (e) out += `-${e}`;
      return out;
    }

    getDigitsCountUpTo(text, caretIndex) {
      return this.onlyDigits(text.slice(0, caretIndex)).length;
    }

    caretFromDigitIndex(formattedText, digitIndex, skipInitialDigits = 0) {
      if (digitIndex <= 0) return 0;
      let count = 0;
      let skipped = 0;
      for (let i = 0; i < formattedText.length; i++) {
        if (/\d/.test(formattedText[i])) {
          if (skipped < skipInitialDigits) {
            skipped++;
            continue;
          }
          count++;
          if (count === digitIndex) return i + 1;
        }
      }
      return formattedText.length;
    }

    normalizePhone(phone) {
      if (!phone) return '';
      let d = this.onlyDigits(phone);
      if (d[0] === '8') d = '7' + d.slice(1);
      if (d[0] === '9') d = '7' + d;
      if (d[0] && d[0] !== '7') d = '7' + d.slice(1);
      d = d.slice(0, 11);
      return d.length === 11 ? '+7' + d.slice(1) : '';
    }

    validatePhone(phone) {
      const normalized = this.normalizePhone(phone);
      if (!normalized) return { valid: false, error: 'Номер телефона не указан' };
      if (normalized.length !== 12) return { valid: false, error: 'Российский номер должен содержать 10 цифр после +7' };
      return { valid: true, normalized };
    }
  }

  return PhoneMaskHandler;
}));


