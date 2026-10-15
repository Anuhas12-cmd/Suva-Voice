import net from 'net';

export function originateAsterisk({ host, port, username, password, phone, callId, secret }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: Number(port) });
    let buffer = '';
    let loggedIn = false;
    let originated = false;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Asterisk AMI timed out'));
    }, 5000);

    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      if (!loggedIn && buffer.includes('Asterisk Call Manager')) {
        socket.write(`Action: Login\r\nUsername: ${username}\r\nSecret: ${password}\r\n\r\n`);
      }
      if (!loggedIn && buffer.includes('Authentication accepted')) {
        loggedIn = true;
        buffer = '';
        const lines = [
          'Action: Originate',
          `Channel: PJSIP/${phone}@suva-trunk`,
          'Context: suva-outbound',
          'Exten: s',
          'Priority: 1',
          'Async: true',
          'CallerID: "Suva Voice" <0112000000>',
          `Variable: CALL_ID=${callId},VOICE_SECRET=${secret}`,
          '',
          ''
        ];
        socket.write(lines.join('\r\n'));
      }
      if (loggedIn && buffer.includes('Authentication failed')) {
        clearTimeout(timer);
        socket.destroy();
        reject(new Error('Asterisk authentication failed'));
      }
      if (!originated && buffer.includes('Originate successfully queued')) {
        originated = true;
        clearTimeout(timer);
        socket.end('Action: Logoff\r\n\r\n');
        resolve();
      }
    });
  });
}
