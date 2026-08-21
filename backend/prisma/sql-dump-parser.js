/**
 * Parser simples de dump SQL (MySQL/phpMyAdmin), sem dependências externas.
 * Extrai, para cada tabela, a lista de linhas (como objetos JS) a partir
 * dos comandos INSERT INTO. Lida com strings entre aspas simples com
 * escape de barra invertida (\n, \', \\, etc.), NULL e números.
 */

function parseRowList(s) {
  const rows = [];
  let i = 0;
  const n = s.length;
  const escapeMap = { n: '\n', r: '\r', t: '\t', '0': '\0', "'": "'", '"': '"', '\\': '\\', Z: '\x1a', b: '\b' };

  while (i < n) {
    while (i < n && ' \t\r\n,'.includes(s[i])) i++;
    if (i >= n) break;
    if (s[i] !== '(') break;
    i++; // skip (

    const row = [];
    while (true) {
      while (i < n && ' \t\r\n'.includes(s[i])) i++;

      if (s[i] === "'") {
        i++;
        let buf = '';
        while (true) {
          const c = s[i];
          if (c === '\\') {
            const nxt = s[i + 1];
            buf += escapeMap[nxt] !== undefined ? escapeMap[nxt] : nxt;
            i += 2;
            continue;
          }
          if (c === "'") {
            if (s[i + 1] === "'") {
              buf += "'";
              i += 2;
              continue;
            }
            i++;
            break;
          }
          buf += c;
          i++;
        }
        row.push(buf);
      } else if (s.slice(i, i + 4) === 'NULL') {
        row.push(null);
        i += 4;
      } else {
        let j = i;
        while (j < n && s[j] !== ',' && s[j] !== ')') j++;
        const numStr = s.slice(i, j).trim();
        row.push(numStr.includes('.') ? parseFloat(numStr) : parseInt(numStr, 10));
        i = j;
      }

      while (i < n && ' \t\r\n'.includes(s[i])) i++;
      if (s[i] === ',') {
        i++;
        continue;
      } else if (s[i] === ')') {
        i++;
        break;
      } else {
        throw new Error(`Erro de parsing perto da posição ${i}: "${s.slice(i, i + 30)}"`);
      }
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Recebe o texto completo do dump SQL e retorna um objeto:
 *   { nomeDaTabela: [ {coluna: valor, ...}, ... ], ... }
 */
function parseSqlDump(sqlText) {
  const insertRe = /INSERT INTO `(\w+)` \(([^)]+)\) VALUES\s*([\s\S]*?);\r?\n/g;
  const tables = {};
  let match;

  while ((match = insertRe.exec(sqlText)) !== null) {
    const table = match[1];
    const cols = match[2].split(',').map((c) => c.trim().replace(/`/g, ''));
    const valuesBlob = match[3];
    const rows = parseRowList(valuesBlob);

    if (!tables[table]) tables[table] = [];
    for (const row of rows) {
      const obj = {};
      cols.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      tables[table].push(obj);
    }
  }

  return tables;
}

module.exports = { parseSqlDump };
