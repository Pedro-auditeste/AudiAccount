// Servidor de e-mail de mentira para o teste automático e a varredura: guarda cada mensagem que chega.
const net = require('node:net');

module.exports = porta => {
  const emails = [];
  const srv = net.createServer(s => {
    let b = '', dados = false;
    s.write('220 falso\r\n');
    s.on('error', () => {});
    s.on('data', c => {
      b += c;
      for (let i; !dados && (i = b.indexOf('\r\n')) >= 0;) {
        const l = b.slice(0, i);
        b = b.slice(i + 2);
        if (l === 'DATA') dados = true;
        s.write(l === 'DATA' ? '354 manda\r\n' : l === 'QUIT' ? '221 tchau\r\n' : l.startsWith('EHLO') ? '250-falso\r\n250 8BITMIME\r\n' : '250 OK\r\n');
      }
      if (dados && b.endsWith('\r\n.\r\n')) { emails.push(b); b = ''; dados = false; s.write('250 OK\r\n'); }
    });
  }).listen(porta, '127.0.0.1');
  return { emails, close: () => srv.close() };
};
