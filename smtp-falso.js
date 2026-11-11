// Servidor de e-mail de mentira para o teste automático e a varredura: guarda cada mensagem que chega e quem entrou.
// Aceita qualquer login, menos com a senha "errada".
const net = require('node:net');

module.exports = porta => {
  const emails = [], logins = [];
  const srv = net.createServer(s => {
    let b = '', dados = false, auth = null; // auth: usuário e senha do AUTH LOGIN em andamento
    s.write('220 falso\r\n');
    s.on('error', () => {});
    s.on('data', c => {
      b += c;
      for (let i; !dados && (i = b.indexOf('\r\n')) >= 0;) {
        const l = b.slice(0, i);
        b = b.slice(i + 2);
        if (auth) {
          auth.push(Buffer.from(l, 'base64').toString());
          if (auth.length === 1) { s.write('334 UGFzc3dvcmQ6\r\n'); continue; }
          const [usuario, senha] = auth;
          auth = null;
          logins.push(usuario);
          s.write(senha === 'errada' ? '535 5.7.8 Authentication failed\r\n' : '235 2.7.0 OK\r\n');
          continue;
        }
        if (l === 'AUTH LOGIN') { auth = []; s.write('334 VXNlcm5hbWU6\r\n'); continue; }
        if (l === 'DATA') dados = true;
        s.write(l === 'DATA' ? '354 manda\r\n' : l === 'QUIT' ? '221 tchau\r\n' : l.startsWith('EHLO') ? '250-falso\r\n250-AUTH LOGIN\r\n250 8BITMIME\r\n' : '250 OK\r\n');
      }
      if (dados && b.endsWith('\r\n.\r\n')) { emails.push(b); b = ''; dados = false; s.write('250 OK\r\n'); }
    });
  }).listen(porta, '127.0.0.1');
  return { emails, logins, close: () => srv.close() };
};
