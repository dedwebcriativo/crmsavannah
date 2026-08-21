const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true, // ignora prefixos de namespace (ex: <nfe:infNFe> vira <infNFe>)
});

// Procura recursivamente a primeira ocorrência de uma chave dentro de um objeto
// já parseado do XML (o layout de NFe/NFSe varia bastante entre municípios/versões,
// então buscamos pelo nome da tag em qualquer nível em vez de assumir um caminho fixo).
function buscarChave(objeto, chave) {
  if (!objeto || typeof objeto !== 'object') return undefined;
  if (objeto[chave] !== undefined) return objeto[chave];

  for (const valor of Object.values(objeto)) {
    if (valor && typeof valor === 'object') {
      const encontrado = buscarChave(Array.isArray(valor) ? valor[0] : valor, chave);
      if (encontrado !== undefined) return encontrado;
    }
  }
  return undefined;
}

// Garante que o valor seja tratado como lista (o fast-xml-parser retorna objeto único
// quando só existe 1 item da tag, e array quando existe mais de 1 - ex: <det> na NFe).
function paraLista(valor) {
  if (valor === undefined || valor === null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

// Busca a chave de acesso de 44 dígitos: tanto no atributo Id="NFe..." do infNFe/infCte
// quanto em tags dedicadas (chNFe, chDFe, chaveAcesso) usadas por algumas NFS-e.
function extrairChaveAcesso(objeto, xmlOriginal) {
  const porTag = buscarChave(objeto, 'chNFe') || buscarChave(objeto, 'chDFe') || buscarChave(objeto, 'chaveAcesso');
  if (porTag) return String(porTag).replace(/\D/g, '');

  const match = xmlOriginal.match(/Id=["']?(?:NFe|NFA|CTe)?(\d{44})["']?/i) || xmlOriginal.match(/(\d{44})/);
  return match ? match[1] : null;
}

function paraTexto(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'object') return null;
  const texto = String(valor).trim();
  return texto || null;
}

function paraData(valor) {
  const texto = paraTexto(valor);
  if (!texto) return null;
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data;
}

function paraNumero(valor) {
  const texto = paraTexto(valor);
  if (!texto) return null;
  const numero = Number(texto);
  return Number.isNaN(numero) ? null : numero;
}

// Monta "Rua X, 123, Bairro, Cidade/UF, CEP 00000-000" a partir de um bloco de
// endereço da NFe (enderEmit/enderDest) ou de uma NFS-e (Endereco).
function montarEndereco(bloco) {
  if (!bloco || typeof bloco !== 'object') return null;
  const logradouro = paraTexto(bloco.xLgr ?? bloco.Endereco ?? bloco.logradouro);
  const numero = paraTexto(bloco.nro ?? bloco.Numero ?? bloco.numero);
  const bairro = paraTexto(bloco.xBairro ?? bloco.Bairro ?? bloco.bairro);
  const cidade = paraTexto(bloco.xMun ?? bloco.Cidade ?? bloco.cidade);
  const uf = paraTexto(bloco.UF ?? bloco.Uf ?? bloco.uf);
  const cep = paraTexto(bloco.CEP ?? bloco.Cep ?? bloco.cep);

  const partes = [
    [logradouro, numero].filter(Boolean).join(', '),
    bairro,
    [cidade, uf].filter(Boolean).join('/'),
    cep ? `CEP ${cep}` : null,
  ].filter(Boolean);

  return partes.length ? partes.join(', ') : null;
}

// Extrai a lista de produtos/serviços (tag <det> da NFe) já formatada para exibição.
function extrairItens(objeto) {
  const infNFe = buscarChave(objeto, 'infNFe') || buscarChave(objeto, 'infNfse') || objeto;
  const detalhes = paraLista(buscarChave(infNFe, 'det'));

  return detalhes
    .map((d) => {
      const prod = d?.prod || d;
      if (!prod) return null;
      const descricao = paraTexto(prod.xProd ?? prod.discriminacao);
      if (!descricao) return null;
      return {
        codigo: paraTexto(prod.cProd),
        descricao,
        ncm: paraTexto(prod.NCM),
        cfop: paraTexto(prod.CFOP),
        unidade: paraTexto(prod.uCom),
        quantidade: paraNumero(prod.qCom),
        valorUnitario: paraNumero(prod.vUnCom),
        valorTotal: paraNumero(prod.vProd),
      };
    })
    .filter(Boolean);
}

/**
 * Extrai os dados relevantes de um XML de NFe/NFA-e/NFSe para pré-preencher o cadastro.
 * Como não existe um padrão nacional único de NFS-e (cada prefeitura tem seu leiaute),
 * a extração é "melhor esforço": tenta várias tags conhecidas e retorna null no que
 * não conseguir localizar, para o usuário completar manualmente.
 *
 * Devolve dois grupos:
 *  - campos "principais", que vão direto nas colunas do cadastro (numero, valorTotal etc.)
 *  - `detalhes`, um objeto com o que dá pra aproveitar para montar um PDF mais parecido
 *    com o DANFE original (endereços, itens, protocolo de autorização, natureza da operação)
 */
function extrairDadosNfe(xmlString) {
  let objeto;
  try {
    objeto = parser.parse(xmlString);
  } catch (err) {
    throw new Error('XML inválido ou corrompido.');
  }

  const emit = buscarChave(objeto, 'emit') || buscarChave(objeto, 'Prestador') || buscarChave(objeto, 'prest');
  const dest = buscarChave(objeto, 'dest') || buscarChave(objeto, 'Tomador') || buscarChave(objeto, 'tomador');
  const total = buscarChave(objeto, 'ICMSTot') || buscarChave(objeto, 'valores') || buscarChave(objeto, 'Valores');
  const ide = buscarChave(objeto, 'ide');
  const infProt = buscarChave(objeto, 'infProt');

  const numero = buscarChave(objeto, 'nNF') || buscarChave(objeto, 'Numero') || buscarChave(objeto, 'numero');
  const serie = buscarChave(objeto, 'serie') || buscarChave(objeto, 'Serie');
  const dataEmissao = buscarChave(objeto, 'dhEmi') || buscarChave(objeto, 'dEmi') || buscarChave(objeto, 'DataEmissao');
  const valorTotal = (total && (total.vNF ?? total.ValorLiquidoNfse ?? total.ValorServicos))
    ?? buscarChave(objeto, 'vNF') ?? buscarChave(objeto, 'ValorServicos');
  const emitenteNome = (emit && (emit.xNome ?? emit.RazaoSocial)) ?? buscarChave(objeto, 'xNome');
  const emitenteCnpj = (emit && (emit.CNPJ ?? emit.Cnpj)) ?? buscarChave(objeto, 'CNPJ');

  const itens = extrairItens(objeto);
  // Discriminação: usa a tag dedicada (comum em NFS-e); se não houver, junta a
  // descrição dos itens de produto extraídos (comum em NF-e/NFA-e).
  const discriminacaoTag = buscarChave(objeto, 'Discriminacao') || buscarChave(objeto, 'discriminacao');
  const discriminacao = paraTexto(discriminacaoTag) || (itens.length ? itens.map((i) => i.descricao).join('; ') : null);

  const tipo = xmlString.includes('<infNFe') || xmlString.includes('<InfNfe')
    ? (xmlString.toLowerCase().includes('nfavulsa') || xmlString.toLowerCase().includes('nfa-e') ? 'NFA' : 'NFE')
    : (xmlString.toLowerCase().includes('nfse') ? 'NFSE' : 'OUTRA');

  return {
    tipo,
    numero: paraTexto(numero),
    serie: paraTexto(serie),
    chaveAcesso: extrairChaveAcesso(objeto, xmlString),
    dataEmissao: paraData(dataEmissao),
    valorTotal: paraNumero(valorTotal),
    emitenteNome: paraTexto(emitenteNome),
    emitenteCnpj: paraTexto(emitenteCnpj),
    discriminacao,
    detalhes: {
      naturezaOperacao: paraTexto(buscarChave(ide, 'natOp')),
      protocoloAutorizacao: paraTexto(buscarChave(infProt, 'nProt')),
      dataAutorizacao: paraTexto(buscarChave(infProt, 'dhRecbto')),
      emitenteIe: paraTexto(emit?.IE),
      emitenteEndereco: montarEndereco(emit?.enderEmit || emit?.Endereco),
      destinatarioNome: paraTexto(dest?.xNome ?? dest?.RazaoSocial),
      destinatarioCnpjCpf: paraTexto(dest?.CNPJ ?? dest?.CPF),
      destinatarioIe: paraTexto(dest?.IE),
      destinatarioEndereco: montarEndereco(dest?.enderDest || dest?.Endereco),
      valorTotalProdutos: paraNumero(total?.vProd),
      valorIcms: paraNumero(total?.vICMS),
      valorIpi: paraNumero(total?.vIPI),
      valorFrete: paraNumero(total?.vFrete),
      valorSeguro: paraNumero(total?.vSeg),
      desconto: paraNumero(total?.vDesc),
      despesasAcessorias: paraNumero(total?.vOutro),
      itens,
    },
  };
}

module.exports = { extrairDadosNfe };
