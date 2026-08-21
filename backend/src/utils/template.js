const { calcularQuintoDiaUtil, calcularValorProporcional } = require('./financeiro');

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return '-';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(data) {
  if (!data) return '-';
  // Datas de calendário (sem horário) são gravadas como meia-noite UTC. Sem forçar o fuso
  // aqui, o servidor exibe no fuso local dele e a data "volta" um dia (ex: 15/07 vira 14/07)
  // quando o servidor roda num fuso atrás de UTC. Forçando UTC, sempre bate com o dia digitado.
  return new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// usarUTC=true pra datas de calendário guardadas no banco (sem horário, ficam meia-noite UTC -
// sem isso, "voltam" um dia no fuso do Brasil). Deixa false (padrão) pra "agora" (horário real local).
function formatarDataExtensa(data, usarUTC = false) {
  const d = data ? new Date(data) : new Date();
  return usarUTC
    ? `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
    : `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

const LABEL_ESTADO_CIVIL = {
  solteiro: 'Solteiro(a)',
  casado: 'Casado(a)',
  uniao_estavel: 'União Estável',
  viuvo: 'Viúvo(a)',
  divorciado: 'Divorciado(a)',
};

// Traduz o código salvo (ex: "uniao_estavel") pro texto amigável; se já vier em
// texto livre (ex: estado civil do proprietário, que é campo aberto), mantém como está
function formatarEstadoCivil(valor) {
  if (!valor) return '-';
  return LABEL_ESTADO_CIVIL[valor] || valor;
}

const LABEL_DESPESA_ADICIONAL = {
  agua: 'Água',
  luz: 'Luz/Energia Elétrica',
  condominio: 'Condomínio',
  gas: 'Gás',
  esgoto: 'Esgoto',
  seguro: 'Seguro',
  iptu: 'IPTU',
};

// Recebe as despesas adicionais selecionadas no contrato (string separada por vírgula,
// ex: "agua,luz,iptu") e monta o parágrafo que entra no contrato - fica vazio se
// nenhuma despesa foi selecionada, pra não aparecer nada no documento.
function montarTextoDespesasAdicionais(despesasAdicionais) {
  if (!despesasAdicionais) return '';
  const lista = despesasAdicionais
    .split(',')
    .map((codigo) => codigo.trim())
    .filter(Boolean)
    .map((codigo) => LABEL_DESPESA_ADICIONAL[codigo] || codigo);

  if (lista.length === 0) return '';

  return `PARÁGRAFO ADICIONAL: Além do valor do aluguel, ficam sob responsabilidade do(a) LOCATÁRIO(A) as seguintes despesas adicionais do imóvel: ${lista.join(', ')}.`;
}

// Número do contrato: usa o valor definido manualmente em "numeroContrato",
// se houver; senão gera o padrão automático (4 dígitos + ano de criação,
// ex: "0042/2026"). É o mesmo número usado no PDF do contrato e no
// demonstrativo, pra facilitar a conferência.
function formatarNumeroContrato(contrato) {
  if (contrato.numeroContrato && contrato.numeroContrato.trim()) {
    return contrato.numeroContrato.trim();
  }
  const ano = new Date(contrato.criadoEm).getFullYear();
  return `${String(contrato.id).padStart(4, '0')}/${ano}`;
}

// Dados bancários fixos da ADMINISTRADORA (Savannah Imóveis), usados apenas na cláusula de
// CAUÇÃO - é a conta poupança para onde vai o valor caucionado (diferente da chave Pix do
// proprietário, usada no pagamento mensal do aluguel). Como não há campo próprio em
// ConfiguracaoEmpresa para esses dados, ficam fixos aqui - atualize se a conta mudar.
const DADOS_BANCARIOS_CAUCAO = 'Pix celular 47984040344 (Banco Sicoob 756, Ag 3031, Conta Poupança Pessoa Jurídica 145.207-0, CNPJ 47.722.352/0001-14, Savannah Imóveis Ltda)';

// Textos padrão de qualificação e cláusula de garantia locatícia, conforme o tipo escolhido
// no contrato: FIADOR pessoal (PROPRIO), CAUÇÃO, Seguro Locatício LOFT (SEGURO_LOFT) ou
// Garantia Investe LOFT (GARANTIA_INVESTE_LOFT). Recebe os valores do fiador/caução já
// resolvidos (não usa {{PLACEHOLDER}} aninhado, que não seria substituído numa segunda passada).
// "LOFT" é mantido como alias de GARANTIA_INVESTE_LOFT pra não quebrar contratos antigos.
// Textos alinhados aos contratos de referência (CONTRATO_LOCAÇÃO_CAUÇÃO/FIADOR/LOFT...).
function montarTextosGarantia(contrato, fiador, caucaoInfo) {
  const tipo = contrato.tipoGarantia === 'LOFT' ? 'GARANTIA_INVESTE_LOFT' : (contrato.tipoGarantia || 'PROPRIO');

  if (tipo === 'CAUCAO') {
    return {
      qualificacao: `**GARANTIA: CAUÇÃO**, no valor de ${caucaoInfo.valorTexto}${caucaoInfo.parcelasTexto}, em substituição à fiança pessoal, nos termos da CLÁUSULA abaixo.`,
      // Texto literal do contrato de referência CONTRATO_LOCAÇÃO_CAUÇÃO.docx (parágrafos da
      // GARANTIA CAUÇÃO), só trocando o valor de exemplo pelo valor real calculado do contrato.
      clausula: `CLÁUSULA DÉCIMA SEXTA - Da Caução: Como garantia locatícia o(a) LOCATÁRIO(A), para garantir o cumprimento de todas as obrigações contratuais assumidas no presente contrato de locação, entrega ao LOCADOR/ADMINISTRADORA, neste ato, a título de caução, o valor equivalente a três (3) vezes o valor do aluguel mensal, totalizando ${caucaoInfo.valorTexto}${caucaoInfo.parcelasTexto}, que será depositado em conta poupança regulamentar vinculada às partes revertendo os juros ao(à) LOCATÁRIO(A) e será aberta (após assinatura deste contrato) em nome da ADMINISTRADORA representante do LOCADOR, no ${DADOS_BANCARIOS_CAUCAO}, conforme disposto no artigo 38 da Lei nº 8.245/1991.
O saldo da referida conta poupança, incluídos os rendimentos, ficará bloqueado até a rescisão do presente contrato. Ao término da locação, caso o(a) LOCATÁRIO(A) tenha cumprido integralmente suas obrigações contratuais e legais, o valor da caução atualizado com os rendimentos da poupança, será devolvido ao(à) LOCATÁRIO(A). Em caso de descumprimentos das obrigações, o LOCADOR/ADMINISTRADORA poderá utilizar o valor da caução para compensar eventuais prejuízos, sem prejuízo de outras medidas legais cabíveis.`,
    };
  }

  if (tipo === 'SEGURO_LOFT') {
    return {
      qualificacao: '**GARANTIA: SEGURO LOCATÍCIO (LOFT)**, em substituição à fiança pessoal e à caução, nos termos da apólice de seguro fiança vinculada a esta locação.',
      // Texto literal do contrato de referência CONTRATO_LOCAÇÃO_LOFT_SEGURO_LOCATÍCIO.docx
      // (Cláusula Padrão da GARANTIA LOFT SEGURO LOCATÍCIO), na íntegra.
      clausula: `CLÁUSULA DÉCIMA SEXTA - Do Seguro Locatício (Fiança Aluguel LOFT): O(A) LOCATÁRIO(A) realizou a contratação da LOFT SOLUÇÕES FINANCEIRAS S/A., pessoa jurídica de direito privado, inscrita no CNPJ sob o n.º 25.027.928/0001-90 ("LOFT"), à qual se compromete, quando solicitado pelo LOCADOR, por meio da Imobiliária (na qualidade de seu representante), a efetuar o pagamento de eventuais débitos relativos ao aluguel e demais encargos da presente locação que venham a ser inadimplidos pelo(a) LOCATÁRIO(A) até o limite do valor máximo afiançado, conforme condições constantes nos Termos e Condições Gerais da FIANÇA ALUGUEL ("T&C") firmado pelo(a) LOCATÁRIO(A), constantes no Anexo I deste instrumento, com o que o LOCADOR anui expressamente. O LOCADOR e o(a) LOCATÁRIO(A) declaram estar cientes e de acordo com todas as condições e limitações relativas à fiança prestada pela LOFT, notadamente, no tocante a: (i) o valor máximo afiançado, (ii) as limitações da responsabilidade da LOFT; (iii) o prazo de vigência da fiança contratada, (iv) as condições para sua renovação, (v) a possibilidade da LOFT substituir a fiança prestada por outra Modalidade de Garantia, especialmente, por seguro garantia financeiro; (vi) as hipóteses de término da FIANÇA ALUGUEL, que ocorrerá pelo primeiro dos seguintes eventos: (a) a entrega das chaves do Imóvel ao LOCADOR; (b) a certidão de despejo emitida por Oficial de Justiça na ação de Despejo; ou (c) a desocupação e disponibilização do Imóvel ao LOCADOR; (vii) a inaplicabilidade, em relação à LOFT, de eventuais cláusulas deste instrumento que contrariem os T&C; e (viii) a rescisão imediata da FIANÇA ALUGUEL, com a consequente liberação da LOFT do pagamento de qualquer indenização, em caso de inadimplemento da contraprestação devida à LOFT pela prestação da fiança ("Taxa LOFT"). O(A) LOCATÁRIO(A) e o LOCADOR reconhecem que, o Contrato de Locação será considerado automaticamente rescindido e, por consequência, também será rescindida a garantia LOFT FIANÇA ALUGUEL em qualquer das hipóteses de término, previstas anteriormente, ficando a LOFT imediatamente liberada do pagamento de qualquer indenização. O LOCADOR declara-se ciente e concorda que os pagamentos dos valores afiançados serão realizados pela LOFT mediante depósito à Imobiliária, na qualidade de representante legal do LOCADOR e se sub-rogará com relação aos valores desembolsados, operando-se, de forma automática, a cessão não onerosa de todos os direitos do LOCADOR em relação ao pagamento efetuado, inclusive, mas não se limitando, a eventuais multas penais ou moratórias devidas pelo(a) LOCATÁRIO(A). Nesta hipótese, o LOCADOR reconhece e aceita expressamente que, uma vez realizados os pagamentos à Imobiliária, a LOFT se exime de qualquer responsabilidade perante o LOCADOR caso a Imobiliária não realize o repasse dos valores ao LOCADOR. E o(a) LOCATÁRIO(A) concorda expressamente que, em caso exoneração da LOFT como fiadora por qualquer motivo detalhado no T&C, especialmente decorrente do inadimplemento do(a) LOCATÁRIO(A), caberá a ele(a), promover, no prazo máximo de 30 (trinta) dias, a substituição da garantia locatícia prestada, que deverá ser expressamente aceita pelo LOCADOR, sob pena de infração contratual e ajuizamento da competente ação de despejo. O e-mail indicado pelo(a) LOCATÁRIO(A) para a Loft quando da contratação da FIANÇA ALUGUEL será considerado apto para recebimento de qualquer comunicação (inclusive judiciais) acerca do Contrato de Locação e decorrentes do T&C, independentemente de confirmação de recebimento. Desta forma, o(a) LOCATÁRIO(A) tem ciência que deverá manter seus dados cadastrais atualizados junto a LOFT. Por fim, para fins de cumprimento das obrigações previstas neste Contrato de Locação e nos T&C a ele vinculados, o LOCADOR, por meio deste instrumento, outorga poderes específicos a LOFT, na qualidade de fiadora do contrato de locação, de forma expressa, irrevogável e irretratável, mandato específico para representá-lo nas seguintes situações: (a) Na hipótese de descumprimento pela Imobiliária das obrigações relativas à FIANÇA ALUGUEL, caracterizando rescisão motivada dos Termos e Condições firmados entre a LOFT e a Imobiliária, o LOCADOR desde já autoriza que a LOFT exerça os poderes anteriormente outorgados pelo LOCADOR à Imobiliária, sub-rogando-se nos direitos e obrigações daqueles Termos e Condições, inclusive para efetivar a cessão de tais direitos e obrigações a outra imobiliária; (b) Notificar o(a) LOCATÁRIO(A), em nome do LOCADOR, em especial para que apresente nova modalidade de garantia locatícia no prazo de até 30 (trinta) dias, conforme previsto no artigo 40, §2º da Lei nº 8.245/1991 (Lei do Inquilinato), sob pena de rescisão contratual e adoção das medidas legais cabíveis; (c) Contratar advogado(s) e outorgar-lhes poderes, para promover, em nome do LOCADOR, o ajuizamento, condução e acompanhamento de ação de despejo, bem como outras ações judiciais ou procedimentos arbitrais relacionados à presente locação, incluindo, mas não se limitando a ações possessórias, medidas cautelares e ações de cobrança, perante qualquer juízo, instância, tribunal ou câmara arbitral (procuração ad judicia); (d) Os advogados contratados poderão receber poderes especiais para, em nome do LOCADOR, transigir, desistir, receber e dar quitação, firmar compromissos, renunciar a direitos, desistir de recursos e/ou reconhecer a procedência de pedidos, desde que tais atos estejam relacionados à defesa dos interesses do LOCADOR no âmbito da locação ora contratada.
Parágrafo único: Os poderes permanecerão válidos enquanto vigente o presente contrato ou até que sejam expressamente revogados por instrumento escrito e registrado, sem prejuízo da validade dos atos já praticados.`,
    };
  }

  if (tipo === 'GARANTIA_INVESTE_LOFT') {
    return {
      qualificacao: '**GARANTIA LOCATÍCIA: GARANTIA INVESTE (LOFT)**, em substituição à fiança pessoal, nos termos da apólice/contrato de garantia vinculado a esta locação.',
      // Texto literal do contrato de referência CONTRATO_LOCAÇÃO_LOFT_GARANTIA_INVESTE.docx
      // (GARANTIA LOFT GARANTIA INVESTE), na íntegra.
      clausula: `CLÁUSULA DÉCIMA SEXTA - Da Garantia Investe (LOFT): O(A) LOCATÁRIO(A) contratou o produto Loft/Garantia Investe ("Garantia Investe"), na modalidade de caução em títulos públicos, junto à LOFT SOLUÇÕES FINANCEIRAS S.A. ("Loft"), inscrita no CNPJ sob o n.º 25.027.928/0001-90, que atuará em conjunto com uma Corretora Parceira para viabilizar a aquisição desses títulos pelo(a) LOCATÁRIO(A).
Parágrafo primeiro: A Loft, além de atuar como facilitadora na relação entre o(a) LOCATÁRIO(A) e a Corretora Parceira em relação à Garantia Investe, será responsável pela gestão da inadimplência deste contrato de locação, conforme descrito nos Termos & Condições dos Serviços Loft (T&C), constantes do Anexo I deste instrumento. As Partes estão cientes de que a Loft não possui responsabilidade de acompanhar o cumprimento deste contrato. Assim, caberá exclusivamente à Imobiliária: (i) verificar a efetiva ocorrência de eventuais inadimplências; (ii) comunicar à Loft, informando o valor em aberto; e (iii) acionar a Garantia Investe para que a Loft providencie o resgate dos valores devidos pelo(a) LOCATÁRIO(A). Após o resgate, a Imobiliária receberá os montantes e ficará encarregada de repassá-los ao LOCADOR.
Parágrafo segundo: A cada Evento de Inadimplência comunicado pela Imobiliária, a Loft notificará o(a) LOCATÁRIO(A), nos termos previstos nos T&C do(a) LOCATÁRIO(A) constantes do Anexo I deste instrumento, para que reponha integralmente o valor resgatado destinado à quitação da dívida informada.
Parágrafo terceiro: O não atendimento à notificação será considerado inadimplemento contratual, podendo ensejar a adoção das medidas judiciais cabíveis, incluindo o encerramento do Contrato de Locação e a retomada do imóvel locado. Nesta hipótese, o(a) LOCATÁRIO(A) reconhece ser o único responsável por todos os custos decorrentes das medidas adotadas para retomada do imóvel, incluindo as despesas com o ajuizamento de ação de despejo.
Parágrafo quarto: Para operar a Garantia Investe e efetuar os resgates de valores devidos, a Loft atuará como procuradora do(a) LOCATÁRIO(A), o(a) qual aceitou eletronicamente a procuração constante do ANEXO II deste Contrato de Locação. A referida procuração concede à Loft plenos poderes para comunicar, movimentar, solicitar resgates e reinvestimentos em nome do(a) LOCATÁRIO(A), sem a necessidade de anuência prévia deste ou das demais Partes deste instrumento.
Parágrafo quinto: Ao assinarem este contrato, as Partes declaram que a Loft atuará sempre conforme as instruções da Imobiliária e não terá responsabilidade por verificar a ocorrência de inadimplência, nem por qualquer aspecto relacionado à gestão da locação. LOCATÁRIO(A), LOCADOR e Imobiliária Parceira reconhecem, de forma inequívoca, que eventuais desacordos ou litígios decorrentes deste Contrato de Locação não envolverão o serviço prestado por meio da Garantia Investe.
Parágrafo sexto: (Garantia Investe Loft ${caucaoInfo.valorTexto}). Ao término da locação, caso o(a) LOCATÁRIO(A) tenha cumprido integralmente suas obrigações contratuais e legais, o valor da garantia com seus rendimentos, será devolvido ao(à) LOCATÁRIO(A). Em caso de descumprimentos das obrigações, o LOCADOR/IMOBILIÁRIA poderá utilizar o valor para cobrir despesas, sem prejuízo de outras medidas legais cabíveis.`,
    };
  }

  return {
    qualificacao: `**FIADOR: ${fiador.nome}**, Brasileiro(a), ${fiador.estadoCivil}, ${fiador.profissao || '-'}, CPF ${fiador.cpf}, RG ${fiador.rg}, Residente na ${fiador.endereco}, telefone ${fiador.telefone}, email ${fiador.email || '-'}, denominado neste instrumento abreviadamente como FIADOR.`,
    // Texto literal do contrato de referência CONTRATO_LOCAÇÃO_FIADOR.docx (§1º a §11º da
    // GARANTIA FIADOR), convertidos de "§" para "Parágrafo" pra seguir o padrão do resto do
    // contrato, e consolidados numa única cláusula (no docx eram todos parágrafos da mesma
    // GARANTIA FIADOR, sem numeração de cláusula própria).
    clausula: `CLÁUSULA DÉCIMA SEXTA - Dos Fiadores/Garantidores: A presente locação é garantida por fiança pessoal, prestada pelo FIADOR qualificado neste instrumento, que responde solidariamente por todas as obrigações contratuais até a efetiva entrega das chaves.
Parágrafo primeiro: Quando o contrato se tornar por período indeterminado, ou renovado a cada 12 meses deve-se seguir conforme o Artigo 835 do Código Civil e o Artigo 40, inciso X da Lei nº 8.245/91.
Parágrafo segundo: Em se tratando de FIADOR casado/ou corresponsável, a assinatura do cônjuge dá-se por imposição legal, mas principalmente ainda para caracterizar ter sido a fiança prestada pelo casal em conjunto e solidariamente, daí por que o falecimento de um deles não exime da responsabilidade contratual do cônjuge sobrevivente.
Parágrafo terceiro: Em caso de morte, falência ou insolvência, ou dissolução da sociedade conjugal, de qualquer um dos fiadores, o LOCATÁRIO obriga-se dentro de 15 (quinze) dias, contados da data do evento, em carta escrita, a apresentar substituto idôneo a juízo do LOCADOR.
Parágrafo quarto: Fica expressamente convencionado que a falência do LOCATÁRIO não exonerará o FIADOR, continuando sua responsabilidade até a desocupação do imóvel e entrega nas condições previstas.
Parágrafo quinto: A não propositura da ação de despejo, imediatamente após o vencimento do aluguel não pago pelo LOCATÁRIO não caracterizará a moratória prevista no artigo 838, inciso I, do Código Civil.
Parágrafo sexto: Nos termos aditivos futuros, firmados entre LOCADOR e LOCATÁRIO, o FIADOR assume todas as alterações havendo necessidade de sua anuência.
Parágrafo sétimo: As obrigações ora assumidas pelo FIADOR estendem-se por todo o período em que o LOCATÁRIO permanecer com imóvel locado (Art. 39 da Lei 8.245/91), quer em virtude de prorrogação ou recusa de devolução por parte do LOCATÁRIO, inclusive pelos reajustes do aluguel, majorados amigavelmente ou por força da lei, mesmo que o FIADOR não tenha tomado ciência do reajuste.
Parágrafo oitavo: Vencido o prazo contratual e se o LOCATÁRIO permanecer no imóvel, o aluguel será corrigido de imediato na forma pactuada, onde efetivamente persistirá a responsabilidade integral do FIADOR enquanto o LOCATÁRIO não proceder a devolução das chaves (Art. 39 da Lei 8.245/91).
Parágrafo nono: O LOCATÁRIO neste ato outorga pelo presente instrumento, ao seu FIADOR ou cônjuge acima qualificados, amplos e especiais poderes para receberem, em conjunto ou separadamente, independente da ordem de nomeação, citações, notificações, intimações, decorrentes de quaisquer ações oriundas do presente contrato de locação.
Parágrafo décimo: A citação das partes pode ser procedida de acordo com o Artigo 58, inciso IV da Lei nº 8.245 de 18/10/91, na pessoa do FIADOR, que se compromete a comunicar imediatamente ao LOCATÁRIO qualquer notificação ou citação recebida.`,
  };
}

// Monta o bloco de assinatura de um sócio/representante legal - aparece logo abaixo da
// assinatura da própria pessoa jurídica (locatário, fiador ou 2º fiador), só quando a
// parte é PJ (CNPJ) E há um sócio responsável cadastrado. Fica vazio nos demais casos.
function montarBlocoAssinaturaSocio(nomeSocio, cpfSocio, nomeEmpresa, papel) {
  if (!nomeSocio) return '';
  return `\n\n\n\n\n\n_________________________________\n${nomeSocio}\nSócio(a)/Representante legal ${papel} ${nomeEmpresa} - CPF ${cpfSocio || '-'}\n`;
}

function ehCpfCnpjPessoaJuridica(valor) {
  return String(valor || '').replace(/\D/g, '').length === 14;
}

// Extrai a lista de sócios/representantes de um inquilino (ou proprietário) -
// lê do campo "sociosJson" (lista sem limite de tamanho) quando existir; senão
// cai no formato antigo (até 2 sócios, nos campos socioResponsavelNome/2Nome,
// seja no cadastro ou no contrato) pra não perder dados já preenchidos.
function extrairListaSocios(pessoa, contrato) {
  if (pessoa && pessoa.sociosJson) {
    try {
      const lista = JSON.parse(pessoa.sociosJson);
      if (Array.isArray(lista) && lista.length) return lista;
    } catch {
      // JSON inválido - ignora e cai no formato antigo abaixo
    }
  }
  const lista = [];
  const nome1 = contrato?.socioResponsavelNome || pessoa?.socioResponsavelNome;
  if (nome1) lista.push({ nome: nome1, cpf: contrato?.socioResponsavelCpf || pessoa?.socioResponsavelCpf });
  const nome2 = contrato?.socioResponsavel2Nome || pessoa?.socioResponsavel2Nome;
  if (nome2) lista.push({ nome: nome2, cpf: contrato?.socioResponsavel2Cpf || pessoa?.socioResponsavel2Cpf });
  return lista;
}

// Monta a cláusula "neste ato representada por FULANO, CPF ... e BELTRANO, CPF ..."
// pra entrar na própria linha de qualificação da parte (não só na assinatura ao
// final) - só aparece quando a parte é PJ e tem ao menos um sócio cadastrado.
// Lista todos os sócios, não só os 2 primeiros.
function montarRepresentacaoLegal(pessoa, contrato) {
  if (!pessoa || !ehCpfCnpjPessoaJuridica(pessoa.cpfCnpj)) return '';
  const socios = extrairListaSocios(pessoa, contrato);
  if (!socios.length) return '';
  const nomes = socios.map((s) => `${s.nome}${s.cpf ? `, CPF ${s.cpf}` : ''}`);
  if (nomes.length === 1) return `, neste ato representada por ${nomes[0]}`;
  return `, neste ato representada por ${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

// Retorna "profissão X" (PF) ou "ramo de atividade X" (PJ), pronto pra entrar
// na linha de qualificação (LOCADOR/LOCATÁRIO). Detecta PJ pelo CPF/CNPJ.
function qualificacaoProfissional(pessoa) {
  if (!pessoa) return '-';
  if (ehCpfCnpjPessoaJuridica(pessoa.cpfCnpj)) {
    return pessoa.ramoAtividade || '-';
  }
  return pessoa.profissao || '-';
}

// Monta o mapa de placeholders -> valores reais a partir do contrato/inquilino/imóvel/empresa
// Monta o endereço completo formatado a partir dos campos estruturados (logradouro, número,
// bairro, cidade, estado, CEP). Usado nos contratos, onde sempre se espera um endereço
// completo em texto único. Ignora qualquer parte que esteja vazia. Quando nenhum campo
// estruturado foi preenchido, cai no texto livre antigo (enderecoLivre) - mantém contratos
// de cadastros antigos funcionando sem precisar re-cadastrar o endereço.
function montarEnderecoCompleto({ endereco, numero, bairro, cidade, estado, cep, enderecoLivre }) {
  const ruaNumero = endereco && numero ? `${endereco}, ${numero}` : (endereco || '');
  const partes = [
    ruaNumero,
    bairro,
    cidade && estado ? `${cidade}/${estado}` : (cidade || estado),
    cep ? `CEP ${cep}` : '',
  ].filter(Boolean);

  if (partes.length > 0) return partes.join(', ');
  return enderecoLivre || '-';
}

function montarDadosPlaceholders({ contrato, inquilino, imovel, config }) {
  const cfg = config || {};

  const fiador = {
    nome: contrato.fiadorNome || inquilino.fiadorNome || '-',
    cpf: contrato.fiadorCpf || inquilino.fiadorCpf || '-',
    rg: contrato.fiadorRg || inquilino.fiadorRg || '-',
    endereco: montarEnderecoCompleto({
      endereco: contrato.fiadorEndereco || inquilino.fiadorEndereco,
      numero: contrato.fiadorNumero || inquilino.fiadorNumero,
      bairro: contrato.fiadorBairro || inquilino.fiadorBairro,
      cidade: contrato.fiadorCidade || inquilino.fiadorCidade,
      estado: contrato.fiadorEstado || inquilino.fiadorEstado,
      cep: contrato.fiadorCep || inquilino.fiadorCep,
      enderecoLivre: contrato.fiadorEndereco || inquilino.fiadorEndereco,
    }),
    telefone: contrato.fiadorTelefone || inquilino.fiadorTelefone || '-',
    email: contrato.fiadorEmail || inquilino.fiadorEmail || '-',
    profissao: contrato.fiadorProfissao || inquilino.fiadorProfissao || '-',
    estadoCivil: formatarEstadoCivil(contrato.fiadorEstadoCivil || inquilino.fiadorEstadoCivil),
    conjugeNome: contrato.fiadorConjugeNome || inquilino.fiadorConjugeNome || '-',
    conjugeCpf: contrato.fiadorConjugeCpf || inquilino.fiadorConjugeCpf || '-',
    conjugeTelefone: contrato.fiadorConjugeTelefone || inquilino.fiadorConjugeTelefone || '-',
  };
  // Segundo fiador (opcional) - mesma lógica de fallback contrato -> cadastro padrão do inquilino
  const fiador2Nome = contrato.fiador2Nome || inquilino.fiador2Nome || '';
  const fiador2 = {
    nome: fiador2Nome || '-',
    cpf: contrato.fiador2Cpf || inquilino.fiador2Cpf || '-',
    rg: contrato.fiador2Rg || inquilino.fiador2Rg || '-',
    endereco: montarEnderecoCompleto({
      endereco: contrato.fiador2Endereco || inquilino.fiador2Endereco,
      numero: contrato.fiador2Numero || inquilino.fiador2Numero,
      bairro: contrato.fiador2Bairro || inquilino.fiador2Bairro,
      cidade: contrato.fiador2Cidade || inquilino.fiador2Cidade,
      estado: contrato.fiador2Estado || inquilino.fiador2Estado,
      cep: contrato.fiador2Cep || inquilino.fiador2Cep,
      enderecoLivre: contrato.fiador2Endereco || inquilino.fiador2Endereco,
    }),
    telefone: contrato.fiador2Telefone || inquilino.fiador2Telefone || '-',
    email: contrato.fiador2Email || inquilino.fiador2Email || '-',
    profissao: contrato.fiador2Profissao || inquilino.fiador2Profissao || '-',
    estadoCivil: formatarEstadoCivil(contrato.fiador2EstadoCivil || inquilino.fiador2EstadoCivil),
    conjugeNome: contrato.fiador2ConjugeNome || inquilino.fiador2ConjugeNome || '-',
    conjugeCpf: contrato.fiador2ConjugeCpf || inquilino.fiador2ConjugeCpf || '-',
    conjugeTelefone: contrato.fiador2ConjugeTelefone || inquilino.fiador2ConjugeTelefone || '-',
  };
  // Dados da caução (usado quando tipoGarantia = CAUCAO) - monta o texto de parcelamento
  // já pronto pra entrar na cláusula ("em 3x de R$ X" ou "em parcela única").
  const caucaoParcelas = contrato.caucaoParcelas && Number(contrato.caucaoParcelas) > 1 ? Number(contrato.caucaoParcelas) : 1;
  const caucaoInfo = {
    valorTexto: contrato.caucao ? formatarMoeda(contrato.caucao) : '-',
    parcelasTexto: caucaoParcelas > 1
      ? `, em ${caucaoParcelas}x de ${formatarMoeda(Number(contrato.caucao || 0) / caucaoParcelas)}`
      : ', em parcela única',
    dataTexto: contrato.caucaoDataPagamento ? formatarData(contrato.caucaoDataPagamento) : '-',
  };
  const textosGarantia = montarTextosGarantia(contrato, fiador, caucaoInfo);

  // Bloco de assinatura do FIADOR: só entra no contrato quando a garantia escolhida é
  // fiança pessoal (PROPRIO) - nos demais tipos (CAUÇÃO, SEGURO_LOFT, GARANTIA_INVESTE_LOFT)
  // não há fiador, então o bloco fica vazio. Quando o fiador é casado, inclui também a
  // linha de assinatura do cônjuge do fiador (mesmo padrão usado pro cônjuge do proprietário).
  const tipoGarantiaNormalizado = contrato.tipoGarantia === 'LOFT' ? 'GARANTIA_INVESTE_LOFT' : (contrato.tipoGarantia || 'PROPRIO');
  const assinaturaConjugeFiador = fiador.estadoCivil === 'Casado(a)' && fiador.conjugeNome && fiador.conjugeNome !== '-'
    ? `\n\n\n\n\n\n_________________________________\n${fiador.conjugeNome}\nCônjuge do(a) Fiador(a) - CPF ${fiador.conjugeCpf}\n`
    : '';
  // Sócio/representante legal do fiador, quando o fiador é PJ (o CPF/CNPJ do fiador tem 14 dígitos)
  const socioFiador = contrato.fiadorSocioResponsavelNome || inquilino.fiadorSocioResponsavelNome || '';
  const socioFiadorCpf = contrato.fiadorSocioResponsavelCpf || inquilino.fiadorSocioResponsavelCpf || '';
  const socioFiador2Nome = contrato.fiadorSocioResponsavel2Nome || inquilino.fiadorSocioResponsavel2Nome || '';
  const socioFiador2Cpf2 = contrato.fiadorSocioResponsavel2Cpf || inquilino.fiadorSocioResponsavel2Cpf || '';
  const blocoAssinaturaSocioFiador = ehCpfCnpjPessoaJuridica(fiador.cpf)
    ? montarBlocoAssinaturaSocio(socioFiador, socioFiadorCpf, fiador.nome, 'do(a) fiador(a)')
      + montarBlocoAssinaturaSocio(socioFiador2Nome, socioFiador2Cpf2, fiador.nome, 'do(a) fiador(a)')
    : '';
  const blocoAssinaturaFiador = tipoGarantiaNormalizado === 'PROPRIO'
    ? `_________________________________\n${fiador.nome}\nFiador
















${assinaturaConjugeFiador}${blocoAssinaturaSocioFiador}`
    : '';

  // Bloco de assinatura do 2º FIADOR (opcional) - só entra quando há fiança pessoal E um
  // 2º fiador foi cadastrado (no contrato ou como padrão do inquilino). Mesmo padrão do
  // primeiro fiador: cônjuge e sócio/representante legal (se o 2º fiador for PJ).
  const assinaturaConjugeFiador2 = fiador2.estadoCivil === 'Casado(a)' && fiador2.conjugeNome && fiador2.conjugeNome !== '-'
    ? `\n\n\n\n\n\n_________________________________\n${fiador2.conjugeNome}\nCônjuge do(a) 2º Fiador(a) - CPF ${fiador2.conjugeCpf}\n`
    : '';
  const socioFiador2 = contrato.fiador2SocioResponsavelNome || inquilino.fiador2SocioResponsavelNome || '';
  const socioFiador2Cpf = contrato.fiador2SocioResponsavelCpf || inquilino.fiador2SocioResponsavelCpf || '';
  const socioFiador2Nome2 = contrato.fiador2SocioResponsavel2Nome || inquilino.fiador2SocioResponsavel2Nome || '';
  const socioFiador2Cpf2Fiador2 = contrato.fiador2SocioResponsavel2Cpf || inquilino.fiador2SocioResponsavel2Cpf || '';
  const blocoAssinaturaSocioFiador2 = ehCpfCnpjPessoaJuridica(fiador2.cpf)
    ? montarBlocoAssinaturaSocio(socioFiador2, socioFiador2Cpf, fiador2.nome, 'do(a) 2º fiador(a)')
      + montarBlocoAssinaturaSocio(socioFiador2Nome2, socioFiador2Cpf2Fiador2, fiador2.nome, 'do(a) 2º fiador(a)')
    : '';
  const blocoAssinaturaFiador2 = tipoGarantiaNormalizado === 'PROPRIO' && fiador2Nome
    ? `\n\n\n_________________________________\n${fiador2.nome}\n2º Fiador
















${assinaturaConjugeFiador2}${blocoAssinaturaSocioFiador2}`
    : '';

  // Sócio/representante legal do LOCATÁRIO, quando ele é PJ (o CPF/CNPJ do inquilino tem
  // 14 dígitos) - assina logo abaixo da assinatura da própria empresa locatária. Lista
  // todos os sócios cadastrados (sem limite), lendo de inquilino.sociosJson.
  const listaSociosLocatario = extrairListaSocios(inquilino, contrato);
  const blocoAssinaturaSocioLocatario = ehCpfCnpjPessoaJuridica(inquilino.cpfCnpj)
    ? listaSociosLocatario.map((s) => montarBlocoAssinaturaSocio(s.nome, s.cpf, inquilino.nome, 'do(a) locatário(a)')).join('')
    : '';

  // Rótulo simples do tipo de garantia e qualificação enxuta do fiador, usados na Rescisão
  // e no Termo de Vistoria (textos mais curtos que a cláusula completa do contrato de
  // locação - ali só se identifica a garantia, sem repetir a cláusula legal inteira).
  const LABEL_GARANTIA_LOCATICIA = {
    CAUCAO: 'CAUÇÃO',
    PROPRIO: 'FIADOR',
    SEGURO_LOFT: 'LOFT SEGURO LOCATÍCIO',
    GARANTIA_INVESTE_LOFT: 'LOFT GARANTIA INVESTE',
  };
  const garantiaLocaticiaLabel = LABEL_GARANTIA_LOCATICIA[tipoGarantiaNormalizado] || 'FIADOR';
  const qualificacaoFiador2 = tipoGarantiaNormalizado === 'PROPRIO' && fiador2Nome
    ? `\n**2º FIADOR: ${fiador2.nome}**, estado civil ${fiador2.estadoCivil}, ${fiador2.profissao || '-'}, CPF ${fiador2.cpf}, RG ${fiador2.rg}, residente em ${fiador2.endereco}, telefone ${fiador2.telefone}, email ${fiador2.email || '-'}, doravante denominado 2º FIADOR.`
    : '';
  const qualificacaoGarantiaVistoriaRescisao = tipoGarantiaNormalizado === 'PROPRIO'
    ? `**FIADOR: ${fiador.nome}**, estado civil ${fiador.estadoCivil}, ${fiador.profissao || '-'}, CPF ${fiador.cpf}, RG ${fiador.rg}, residente em ${fiador.endereco}, telefone ${fiador.telefone}, email ${fiador.email || '-'}, doravante denominado FIADOR.${qualificacaoFiador2}`
    : `GARANTIA ${garantiaLocaticiaLabel}:`;

  // Bloco de cláusulas adicionais (observações do contrato), formatado pra entrar
  // ANTES da descrição do imóvel no contrato - fica vazio se não houver nada preenchido.
  const clausulasAdicionais = contrato.observacoes
    ? `CLÁUSULAS ADICIONAIS\n${contrato.observacoes}\n`
    : '';

  const despesasAdicionaisTexto = montarTextoDespesasAdicionais(contrato.despesasAdicionais);

  // Cônjuge do proprietário: só entra no contrato (qualificação + linha de assinatura)
  // quando o estado civil do proprietário for "casado" - segue o mesmo padrão usado
  // pro fiador, mas os dados vêm direto do cadastro do proprietário (não há campo por contrato).
  const proprietarioObj = imovel.proprietario || {};
  const conjugeProprietarioNome = proprietarioObj.conjugeNome || '-';
  const conjugeProprietarioCpf = proprietarioObj.conjugeCpfCnpj || '-';
  const assinaturaConjugeProprietario = proprietarioObj.estadoCivil === 'casado' && proprietarioObj.conjugeNome
    ? `\n\n\n\n\n\n_________________________________\n${conjugeProprietarioNome}\nCônjuge do(a) Proprietário(a) - CPF ${conjugeProprietarioCpf}\n`
    : '';

  // Sócio(s)/representante(s) legal(is) do PROPRIETÁRIO, quando ele é PJ (CPF/CNPJ com 14
  // dígitos) - assina(m) logo abaixo da assinatura da própria empresa proprietária.
  const blocoAssinaturaSocioProprietario = ehCpfCnpjPessoaJuridica(proprietarioObj.cpfCnpj)
    ? montarBlocoAssinaturaSocio(proprietarioObj.socioResponsavelNome, proprietarioObj.socioResponsavelCpf, proprietarioObj.nome, 'do(a) proprietário(a)')
      + montarBlocoAssinaturaSocio(proprietarioObj.socioResponsavel2Nome, proprietarioObj.socioResponsavel2Cpf, proprietarioObj.nome, 'do(a) proprietário(a)')
    : '';

  // "Mês/ano" do primeiro pagamento (mês de início do contrato) e dos pagamentos seguintes
  // (mês seguinte), usados na cláusula de valor da locação.
  const dataInicioObj = contrato.dataInicio ? new Date(contrato.dataInicio) : new Date();

  // Vencimento do aluguel: só o dia do mês (1-31) ou "sempre o 5º dia útil do mês" - o
  // mês/ano usado no texto é o do início do contrato. Cai pro dia da data de início quando
  // nada for informado, pra manter compatibilidade com contratos criados antes desse campo.
  // Usa getters UTC porque dataInicio é gravada como meia-noite UTC (data de calendário sem
  // horário) - getters locais "voltariam" um dia no fuso do Brasil.
  const vencimentoQuintoDiaUtil = !!contrato.vencimentoQuintoDiaUtil;
  const diaVencimentoNum = vencimentoQuintoDiaUtil ? null : (contrato.diaVencimento || dataInicioObj.getUTCDate());
  const dataVencimentoObj = vencimentoQuintoDiaUtil
    ? calcularQuintoDiaUtil(dataInicioObj.getUTCFullYear(), dataInicioObj.getUTCMonth())
    : new Date(
        dataInicioObj.getUTCFullYear(),
        dataInicioObj.getUTCMonth(),
        Math.min(diaVencimentoNum, new Date(dataInicioObj.getUTCFullYear(), dataInicioObj.getUTCMonth() + 1, 0).getDate()),
      );
  const diaVencimentoTexto = vencimentoQuintoDiaUtil ? 'o 5º dia útil' : `o dia ${diaVencimentoNum}`;
  const mesAnoPrimeiroPagamento = `${MESES[dataInicioObj.getUTCMonth()]} ${dataInicioObj.getUTCFullYear()}`;
  const dataSegundoPagamento = new Date(Date.UTC(dataInicioObj.getUTCFullYear(), dataInicioObj.getUTCMonth() + 1, 1));
  const mesAnoPagamentosSeguintes = `${MESES[dataSegundoPagamento.getUTCMonth()]} ${dataSegundoPagamento.getUTCFullYear()}`;

  // Observação do 1º aluguel proporcional - só entra no texto quando há data de entrada
  // cadastrada e ela é diferente do 1º dia do mês (contrato "começa no meio do mês").
  let observacaoAluguelProporcional = '';
  if (contrato.dataEntrada) {
    const dataEntradaObj = new Date(contrato.dataEntrada);
    if (dataEntradaObj.getUTCDate() !== 1) {
      const valorProporcional = calcularValorProporcional(contrato.valorAluguel, new Date(
        Date.UTC(dataEntradaObj.getUTCFullYear(), dataEntradaObj.getUTCMonth(), dataEntradaObj.getUTCDate())
      ));
      const ultimoDiaMes = new Date(Date.UTC(dataEntradaObj.getUTCFullYear(), dataEntradaObj.getUTCMonth() + 1, 0)).getUTCDate();
      observacaoAluguelProporcional = `Parágrafo terceiro: Considerando que a entrada do(a) Locatário(a) no imóvel se dá em ${formatarData(dataEntradaObj)}, o primeiro aluguel é cobrado de forma proporcional aos dias de ocupação naquele mês (de ${formatarData(dataEntradaObj)} a ${String(ultimoDiaMes).padStart(2, '0')}/${String(dataEntradaObj.getUTCMonth() + 1).padStart(2, '0')}/${dataEntradaObj.getUTCFullYear()}), no valor de **${formatarMoeda(valorProporcional)}**.`;
    }
  }

  // Lista de e-mails das partes (proprietário, inquilino, fiador), usada no parágrafo que
  // referencia o Termo de Vistoria de Entrada e o envio das fotos por e-mail.
  const emailsPartes = [imovel.proprietario?.email, inquilino.email, fiador.email !== '-' ? fiador.email : null]
    .filter(Boolean)
    .join(' - ');

// Monta a menção ao cônjuge/parceiro(a)/ex-parceiro(a) para entrar logo depois do estado civil
// na qualificação do contrato (ex: "Casado(a) com Fulana, CPF 000.000.000-00"). Fica vazia
// quando o estado civil não pede parceiro ou quando não há dados de parceiro cadastrados.
function montarMencaoConjuge(estadoCivil, nome, cpf, rg, telefone) {
  const estadoCivilCodigo = String(estadoCivil || '').toLowerCase();
  if (!nome || nome === '-') return '';
  const detalhes = [];
  if (cpf && cpf !== '-') detalhes.push(`CPF ${cpf}`);
  if (rg) detalhes.push(`RG ${rg}`);
  if (telefone) detalhes.push(`telefone ${telefone}`);
  const detalhesTexto = detalhes.length ? `, ${detalhes.join(', ')}` : '';
  if (estadoCivilCodigo === 'casado') return ` com ${nome}${detalhesTexto}`;
  if (estadoCivilCodigo === 'uniao_estavel') return ` com ${nome}${detalhesTexto}`;
  if (estadoCivilCodigo === 'divorciado') return ` de ${nome}${detalhesTexto}`;
  return '';
}

  return {
    NUMERO_CONTRATO: formatarNumeroContrato(contrato),
    MES_ANO_PRIMEIRO_PAGAMENTO: mesAnoPrimeiroPagamento,
    MES_ANO_PAGAMENTOS_SEGUINTES: mesAnoPagamentosSeguintes,
    OBSERVACAO_ALUGUEL_PROPORCIONAL: observacaoAluguelProporcional,
    EMAILS_PARTES: emailsPartes || '-',

    NOME_INQUILINO: inquilino.nome || '-',
    CPF_INQUILINO: inquilino.cpfCnpj || '-',
    RG_INQUILINO: inquilino.rgCnh || '-',
    TELEFONE_INQUILINO: inquilino.telefone || '-',
    EMAIL_INQUILINO: inquilino.email || '-',
    ENDERECO_INQUILINO: montarEnderecoCompleto({
      endereco: inquilino.enderecoAtual, numero: inquilino.numeroAtual, bairro: inquilino.bairroAtual,
      cidade: inquilino.cidadeAtual, estado: inquilino.estadoAtual, cep: inquilino.cepAtual,
      enderecoLivre: inquilino.enderecoAtual,
    }),
    ESTADO_CIVIL_INQUILINO: ehCpfCnpjPessoaJuridica(inquilino.cpfCnpj) ? '' : (formatarEstadoCivil(inquilino.estadoCivil) + montarMencaoConjuge(inquilino.estadoCivil, inquilino.conjugeNome, inquilino.conjugeCpfCnpj, inquilino.conjugeRg, inquilino.conjugeTelefone)),
    QUALIFICACAO_PROFISSIONAL_INQUILINO: qualificacaoProfissional(inquilino),
    QUALIFICACAO_REPRESENTANTE_INQUILINO: montarRepresentacaoLegal(
      { cpfCnpj: inquilino.cpfCnpj, sociosJson: inquilino.sociosJson, socioResponsavelNome: inquilino.socioResponsavelNome, socioResponsavelCpf: inquilino.socioResponsavelCpf, socioResponsavel2Nome: inquilino.socioResponsavel2Nome, socioResponsavel2Cpf: inquilino.socioResponsavel2Cpf },
      contrato
    ),

    NOME_IMOVEL: imovel.nome || imovel.endereco || '-',
    ENDERECO_IMOVEL: [imovel.endereco, imovel.numero, imovel.complemento].filter(Boolean).join(', ') + (imovel.bairro ? ` - ${imovel.bairro}` : '') || '-',
    DESCRICAO_IMOVEL: imovel.descricao || '-',
    VALOR_IPTU_IMOVEL: imovel.valorIptu ? formatarMoeda(imovel.valorIptu) : 'não informado',
    CIDADE_IMOVEL: imovel.cidade || '-',
    CIDADE_ESTADO_IMOVEL: imovel.cidade && imovel.estado ? `${imovel.cidade} - ${imovel.estado}` : (imovel.cidade || '-'),
    ESTADO_IMOVEL: imovel.estado || '-',
    CEP_IMOVEL: imovel.cep || '-',
    TIPO_IMOVEL: imovel.tipo || '-',

    NOME_PROPRIETARIO: imovel.proprietario?.nome || '-',
    CPF_PROPRIETARIO: imovel.proprietario?.cpfCnpj || '-',
    RG_PROPRIETARIO: imovel.proprietario?.rg || '-',
    NACIONALIDADE_PROPRIETARIO: ehCpfCnpjPessoaJuridica(imovel.proprietario?.cpfCnpj) ? '' : (imovel.proprietario?.nacionalidade || 'Brasileiro(a)'),
    ESTADO_CIVIL_PROPRIETARIO: ehCpfCnpjPessoaJuridica(imovel.proprietario?.cpfCnpj) ? '' : (formatarEstadoCivil(imovel.proprietario?.estadoCivil) + montarMencaoConjuge(imovel.proprietario?.estadoCivil, imovel.proprietario?.conjugeNome, imovel.proprietario?.conjugeCpfCnpj, imovel.proprietario?.conjugeRg, imovel.proprietario?.conjugeTelefone)),
    PROFISSAO_PROPRIETARIO: qualificacaoProfissional(imovel.proprietario),
    QUALIFICACAO_REPRESENTANTE_PROPRIETARIO: montarRepresentacaoLegal(imovel.proprietario),
    TELEFONE_PROPRIETARIO: imovel.proprietario?.telefone || '-',
    EMAIL_PROPRIETARIO: imovel.proprietario?.email || '-',
    ENDERECO_PROPRIETARIO: montarEnderecoCompleto({
      endereco: imovel.proprietario?.endereco, numero: imovel.proprietario?.numero, bairro: imovel.proprietario?.bairro,
      cidade: imovel.proprietario?.cidade, estado: imovel.proprietario?.estado, cep: imovel.proprietario?.cep,
      enderecoLivre: imovel.proprietario?.endereco,
    }),
    CHAVE_PIX_PROPRIETARIO: imovel.proprietario?.chavePix || '-',
    BANCO_PROPRIETARIO: imovel.proprietario?.bancoNome || '-',
    AGENCIA_PROPRIETARIO: imovel.proprietario?.bancoAgencia || '-',
    CONTA_PROPRIETARIO: imovel.proprietario?.bancoConta || '-',
    CONJUGE_PROPRIETARIO_NOME: conjugeProprietarioNome,
    CONJUGE_PROPRIETARIO_CPF: conjugeProprietarioCpf,
    ASSINATURA_CONJUGE_PROPRIETARIO: assinaturaConjugeProprietario,
    BLOCO_ASSINATURA_SOCIO_PROPRIETARIO: blocoAssinaturaSocioProprietario,

    VALOR_ALUGUEL: formatarMoeda(contrato.valorAluguel),
    INDICE_REAJUSTE: { IVAR: 'IVAR', IGPM: 'IGP-M', IPCA: 'IPCA', INPC: 'INPC' }[contrato.indiceReajuste] || 'IVAR',
    CAUCAO: contrato.caucao ? formatarMoeda(contrato.caucao) : 'Não aplicável',
    CAUCAO_PARCELAS: String(caucaoParcelas),
    CAUCAO_DATA_PAGAMENTO: caucaoInfo.dataTexto,
    PERCENTUAL_COMISSAO: contrato.percentualComissao ? `${Number(contrato.percentualComissao)}%` : '-',
    PERCENTUAL_INTERMEDIACAO: contrato.percentualTaxaIntermediacao ? `${Number(contrato.percentualTaxaIntermediacao)}%` : '-',
    DATA_INICIO: formatarData(contrato.dataInicio),
    DATA_FIM: formatarData(contrato.dataFim),
    DATA_VENCIMENTO: formatarData(dataVencimentoObj),
    DIA_VENCIMENTO: diaVencimentoTexto,
    DATA_HOJE: formatarDataExtensa(contrato.dataAssinatura || new Date()),
    DATA_VISTORIA_INICIAL: contrato.dataVistoriaInicial ? formatarDataExtensa(contrato.dataVistoriaInicial, true) : '____________________',
    DATA_VISTORIA_FINAL: contrato.dataVistoriaFinal ? formatarDataExtensa(contrato.dataVistoriaFinal, true) : '____________________',
    // CHECKLIST_VISTORIA_INICIAL / CHECKLIST_VISTORIA_FINAL não entram aqui de propósito:
    // são desenhados como tabela de caixinhas (Ruim/Bom/N.A.) diretamente no PDF.

    CLAUSULAS_ADICIONAIS: clausulasAdicionais,
    DESPESAS_ADICIONAIS: despesasAdicionaisTexto,

    QUALIFICACAO_GARANTIA: textosGarantia.qualificacao + (tipoGarantiaNormalizado === 'PROPRIO' && fiador2Nome ? `\n\n**2º FIADOR: ${fiador2.nome}**, estado civil ${fiador2.estadoCivil}, ${fiador2.profissao ? `profissão ${fiador2.profissao}, ` : ''}CPF ${fiador2.cpf}, RG ${fiador2.rg}, Residente na ${fiador2.endereco}, telefone ${fiador2.telefone}, email ${fiador2.email || '-'}, denominado neste instrumento abreviadamente como 2º FIADOR.` : ''),
    CLAUSULA_GARANTIA: textosGarantia.clausula,

    FIADOR_NOME: fiador.nome,
    FIADOR_CPF: fiador.cpf,
    FIADOR_RG: fiador.rg,
    FIADOR_ENDERECO: fiador.endereco,
    FIADOR_TELEFONE: fiador.telefone,
    FIADOR_EMAIL: fiador.email,
    FIADOR_PROFISSAO: fiador.profissao,
    FIADOR_ESTADO_CIVIL: fiador.estadoCivil,
    FIADOR_CONJUGE_NOME: fiador.conjugeNome,
    FIADOR_CONJUGE_CPF: fiador.conjugeCpf,
    FIADOR_CONJUGE_TELEFONE: fiador.conjugeTelefone,
    BLOCO_ASSINATURA_FIADOR: blocoAssinaturaFiador,
    BLOCO_ASSINATURA_FIADOR2: blocoAssinaturaFiador2,
    BLOCO_ASSINATURA_SOCIO_LOCATARIO: blocoAssinaturaSocioLocatario,
    GARANTIA_LOCATICIA_LABEL: garantiaLocaticiaLabel,
    QUALIFICACAO_GARANTIA_VISTORIA_RESCISAO: qualificacaoGarantiaVistoriaRescisao,

    ASSINANTES_ADICIONAIS: contrato.assinantesAdicionais || '',

    TESTEMUNHA1_NOME: contrato.testemunha1Nome || inquilino.testemunha1Nome || '_________________________',
    TESTEMUNHA1_CPF: contrato.testemunha1Cpf || inquilino.testemunha1Cpf || '-',
    TESTEMUNHA2_NOME: contrato.testemunha2Nome || inquilino.testemunha2Nome || '_________________________',
    TESTEMUNHA2_CPF: contrato.testemunha2Cpf || inquilino.testemunha2Cpf || '-',
    BLOCO_TESTEMUNHAS: '[[BLOCO_TESTEMUNHAS]]',

    DATA_RESCISAO: contrato.dataRescisao ? formatarDataExtensa(contrato.dataRescisao, true) : formatarDataExtensa(new Date()),
    MOTIVO_RESCISAO: contrato.motivoRescisao || '-',
    MULTA_RESCISAO: contrato.multaRescisao ? formatarMoeda(contrato.multaRescisao) : 'Não aplicável',
    OBSERVACOES_RESCISAO: contrato.observacoesRescisao || '-',

    NOME_EMPRESA: cfg.nomeEmpresa || 'Savannah Imóveis',
    CNPJ_EMPRESA: cfg.cnpj || '-',
    ENDERECO_EMPRESA: montarEnderecoCompleto({
      endereco: cfg.endereco,
      numero: cfg.numero,
      bairro: cfg.bairro,
      cidade: cfg.cidade,
      estado: cfg.estado,
      cep: cfg.cep,
    }),
    TELEFONE_EMPRESA: cfg.telefone || '-',
    EMAIL_EMPRESA: cfg.email || '-',
    CRECI: cfg.creci || '-',
    CHAVE_PIX_EMPRESA: cfg.chavePix || '-',
    BANCO_EMPRESA: cfg.bancoNome || '-',
    AGENCIA_EMPRESA: cfg.bancoAgencia || '-',
    CONTA_EMPRESA: cfg.bancoConta || '-',
    CORRETORA_NOME: cfg.corretoraResponsavelNome || cfg.nomeEmpresa || '-',
    CORRETORA_CPF: cfg.corretoraResponsavelCpf || '-',
    CORRETORA_RG: cfg.corretoraResponsavelRg || '-',
  };
}

// Substitui todos os {{PLACEHOLDER}} do texto pelos valores correspondentes
function substituirPlaceholders(texto, dados) {
  const substituido = Object.entries(dados).reduce(
    (acc, [chave, valor]) => acc.split(`{{${chave}}}`).join(valor ?? ''),
    texto
  );
  // Limpa vírgulas/espaços órfãos que sobram quando um placeholder no meio de
  // uma frase (ex: estado civil, vazio para PJ) resolve pra string vazia -
  // evita coisas como "Brasileiro(a), , CPF..." no documento final.
  return substituido
    .replace(/[ \t]+,/g, ',')       // espaço antes de vírgula
    .replace(/,(\s*,)+/g, ',')      // vírgulas repetidas ("X, , Y" -> "X, Y")
    .replace(/,(\s*\.)/g, '$1')     // vírgula logo antes de ponto final
    .replace(/,(\s*\))/g, '$1');    // vírgula logo antes de fechar parênteses
}

// Regex que identifica o início de uma cláusula em qualquer um dos modelos -
// aceita "CLÁUSULA PRIMEIRA", "CLÁUSULA 1ª", "CLÁUSULA 2 –", com ou sem **
// negrito ao redor, mesmo quando o texto da cláusula começa logo em seguida
// na mesma linha (ex: "CLÁUSULA PRIMEIRA: O prazo de locação é..."). Captura
// só o cabeçalho (até o primeiro ":" ou "-"), não o corpo do parágrafo.
const REGEX_CLAUSULA = /\*{0,2}(CLÁUSULA\s+(?:\d+[ªº]?|[\p{Lu}][\p{Lu}\u00C0-\u00DC\d\s]*?))\*{0,2}\s*[:\-–]/gmu;

// Lê um modelo de contrato (texto bruto, com placeholders ainda não
// substituídos) e devolve a lista de cláusulas encontradas nele, na ordem em
// que aparecem - usado pra montar o seletor "em qual cláusula adicionar esse
// texto complementar" na tela de Contratos.
function extrairClausulasDoModelo(textoModelo) {
  const clausulas = [];
  const vistas = new Set();
  let m;
  REGEX_CLAUSULA.lastIndex = 0;
  while ((m = REGEX_CLAUSULA.exec(textoModelo)) !== null) {
    const texto = m[1].trim();
    if (!vistas.has(texto)) {
      vistas.add(texto);
      clausulas.push(texto);
    }
  }
  return clausulas;
}

// Insere o texto complementar de cada cláusula escolhida logo depois do
// parágrafo daquela cláusula no documento já finalizado (placeholders já
// substituídos). Localiza a cláusula pelo texto do cabeçalho (ex: "CLÁUSULA
// QUARTA") e insere antes do início da próxima cláusula (ou no fim do
// documento, se for a última). Cláusulas que não forem encontradas no texto
// final são ignoradas silenciosamente (ex: o usuário trocou de modelo depois
// de escolher a cláusula).
function inserirClausulasAdicionais(textoFinal, clausulasAdicionaisJson) {
  if (!clausulasAdicionaisJson) return textoFinal;

  let lista;
  try {
    lista = JSON.parse(clausulasAdicionaisJson);
  } catch {
    return textoFinal; // JSON inválido - não trava a geração do documento
  }
  if (!Array.isArray(lista) || !lista.length) return textoFinal;

  // Mapeia todas as posições de início de cláusula no texto final, na ordem.
  const posicoes = [];
  let m;
  const regex = new RegExp(REGEX_CLAUSULA.source, REGEX_CLAUSULA.flags);
  while ((m = regex.exec(textoFinal)) !== null) {
    posicoes.push({ inicio: m.index, textoCabecalho: m[1].replace(/\s+/g, ' ').trim() });
  }

  let resultado = textoFinal;
  // Aplica de trás pra frente (maior índice primeiro) pra não bagunçar as
  // posições já calculadas conforme o texto vai crescendo com as inserções.
  const insercoes = [];
  for (const item of lista) {
    if (!item || !item.clausula || !item.texto || !item.texto.trim()) continue;
    const idx = posicoes.findIndex((p) => p.textoCabecalho.startsWith(item.clausula.trim()));
    if (idx === -1) continue; // cláusula não encontrada nesse modelo - ignora
    const fimDaClausula = idx + 1 < posicoes.length ? posicoes[idx + 1].inicio : resultado.length;
    insercoes.push({ posicao: fimDaClausula, texto: `\n${item.texto.trim()}\n` });
  }

  insercoes.sort((a, b) => b.posicao - a.posicao);
  for (const { posicao, texto } of insercoes) {
    resultado = resultado.slice(0, posicao) + texto + resultado.slice(posicao);
  }

  return resultado;
}

const LISTA_PLACEHOLDERS = [
  { chave: 'NUMERO_CONTRATO', label: 'Número do contrato (####/ano)' },
  { chave: 'MES_ANO_PRIMEIRO_PAGAMENTO', label: 'Mês/ano do primeiro pagamento' },
  { chave: 'MES_ANO_PAGAMENTOS_SEGUINTES', label: 'Mês/ano dos pagamentos seguintes' },
  { chave: 'EMAILS_PARTES', label: 'E-mails de todas as partes (proprietário, inquilino, fiador)' },
  { chave: 'CLAUSULAS_ADICIONAIS', label: 'Bloco de cláusulas adicionais (antes da descrição do imóvel)' },
  { chave: 'QUALIFICACAO_GARANTIA', label: 'Qualificação do fiador ou da garantia LOFT (conforme tipo escolhido)' },
  { chave: 'CLAUSULA_GARANTIA', label: 'Cláusula de fiança ou garantia LOFT (conforme tipo escolhido)' },
  { chave: 'NOME_INQUILINO', label: 'Nome do inquilino' },
  { chave: 'CPF_INQUILINO', label: 'CPF/CNPJ do inquilino' },
  { chave: 'RG_INQUILINO', label: 'RG/CNH ou Inscrição Estadual do inquilino' },
  { chave: 'TELEFONE_INQUILINO', label: 'Telefone do inquilino' },
  { chave: 'EMAIL_INQUILINO', label: 'Email do inquilino' },
  { chave: 'ENDERECO_INQUILINO', label: 'Endereço atual do inquilino' },
  { chave: 'ESTADO_CIVIL_INQUILINO', label: 'Estado civil do inquilino' },
  { chave: 'QUALIFICACAO_PROFISSIONAL_INQUILINO', label: 'Profissão (PF) ou ramo de atividade (PJ) do inquilino' },
  { chave: 'QUALIFICACAO_REPRESENTANTE_INQUILINO', label: 'Cláusula "representada por Fulano, CPF..." quando o inquilino é PJ (vazio se PF)' },
  { chave: 'NOME_IMOVEL', label: 'Nome do imóvel' },
  { chave: 'ENDERECO_IMOVEL', label: 'Endereço do imóvel' },
  { chave: 'DESCRICAO_IMOVEL', label: 'Descrição/características do imóvel (área, cômodos etc. - diferente do estado de conservação da vistoria)' },
  { chave: 'VALOR_IPTU_IMOVEL', label: 'Valor do IPTU cadastrado no imóvel' },
  { chave: 'CIDADE_IMOVEL', label: 'Cidade do imóvel' },
  { chave: 'CIDADE_ESTADO_IMOVEL', label: 'Cidade - Estado do imóvel (usado no rodapé "Canoinhas - SC, [data]")' },
  { chave: 'ESTADO_IMOVEL', label: 'Estado (UF) do imóvel' },
  { chave: 'CEP_IMOVEL', label: 'CEP do imóvel' },
  { chave: 'TIPO_IMOVEL', label: 'Tipo do imóvel' },
  { chave: 'NOME_PROPRIETARIO', label: 'Nome do proprietário' },
  { chave: 'CPF_PROPRIETARIO', label: 'CPF do proprietário' },
  { chave: 'RG_PROPRIETARIO', label: 'RG do proprietário' },
  { chave: 'NACIONALIDADE_PROPRIETARIO', label: 'Nacionalidade do proprietário' },
  { chave: 'ESTADO_CIVIL_PROPRIETARIO', label: 'Estado civil do proprietário' },
  { chave: 'PROFISSAO_PROPRIETARIO', label: 'Profissão do proprietário' },
  { chave: 'QUALIFICACAO_REPRESENTANTE_PROPRIETARIO', label: 'Cláusula "representada por Fulano, CPF..." quando o proprietário é PJ (vazio se PF)' },
  { chave: 'TELEFONE_PROPRIETARIO', label: 'Telefone do proprietário' },
  { chave: 'EMAIL_PROPRIETARIO', label: 'Email do proprietário' },
  { chave: 'ENDERECO_PROPRIETARIO', label: 'Endereço do proprietário' },
  { chave: 'CHAVE_PIX_PROPRIETARIO', label: 'Chave PIX do proprietário' },
  { chave: 'BANCO_PROPRIETARIO', label: 'Banco do proprietário' },
  { chave: 'AGENCIA_PROPRIETARIO', label: 'Agência do proprietário' },
  { chave: 'CONTA_PROPRIETARIO', label: 'Conta do proprietário' },
  { chave: 'CHAVE_PIX_EMPRESA', label: 'Chave PIX da imobiliária (recebimento do aluguel)' },
  { chave: 'BANCO_EMPRESA', label: 'Banco da imobiliária' },
  { chave: 'AGENCIA_EMPRESA', label: 'Agência da imobiliária' },
  { chave: 'CONTA_EMPRESA', label: 'Conta da imobiliária' },
  { chave: 'CONJUGE_PROPRIETARIO_NOME', label: 'Nome do cônjuge do proprietário (se casado)' },
  { chave: 'CONJUGE_PROPRIETARIO_CPF', label: 'CPF do cônjuge do proprietário (se casado)' },
  { chave: 'ASSINATURA_CONJUGE_PROPRIETARIO', label: 'Linha de assinatura do cônjuge do proprietário (some sozinha se não for casado)' },
  { chave: 'BLOCO_ASSINATURA_SOCIO_PROPRIETARIO', label: 'Assinatura do(s) sócio(s)/representante(s) legal(is), quando o proprietário é PJ' },
  { chave: 'VALOR_ALUGUEL', label: 'Valor do aluguel' },
  { chave: 'INDICE_REAJUSTE', label: 'Índice de reajuste anual escolhido no contrato (IVAR, IGP-M, IPCA ou INPC)' },
  { chave: 'CAUCAO', label: 'Valor da caução' },
  { chave: 'CAUCAO_PARCELAS', label: 'Número de parcelas da caução' },
  { chave: 'CAUCAO_DATA_PAGAMENTO', label: 'Data do pagamento (ou 1ª parcela) da caução' },
  { chave: 'PERCENTUAL_COMISSAO', label: '% comissão mensal' },
  { chave: 'PERCENTUAL_INTERMEDIACAO', label: '% taxa de intermediação' },
  { chave: 'DATA_INICIO', label: 'Data de início' },
  { chave: 'DATA_FIM', label: 'Data de término' },
  { chave: 'DATA_VENCIMENTO', label: 'Data do 1º vencimento do aluguel (dia calculado no mês de início)' },
  { chave: 'DIA_VENCIMENTO', label: 'Vencimento do aluguel por extenso ("o dia 10" ou "o 5º dia útil")' },
  { chave: 'DESPESAS_ADICIONAIS', label: 'Parágrafo com as despesas adicionais selecionadas (água, luz, condomínio etc.)' },
  { chave: 'DATA_HOJE', label: 'Data de assinatura do contrato (ou data de hoje, se não preenchida)' },
  { chave: 'DATA_VISTORIA_INICIAL', label: 'Data da vistoria de entrada' },
  { chave: 'DATA_VISTORIA_FINAL', label: 'Data da vistoria de saída' },
  { chave: 'CHECKLIST_VISTORIA_INICIAL', label: 'Checklist da vistoria de entrada (tabela com caixinhas, automático)' },
  { chave: 'CHECKLIST_VISTORIA_FINAL', label: 'Checklist da vistoria de saída (tabela com caixinhas, automático)' },
  { chave: 'FIADOR_NOME', label: 'Nome do fiador' },
  { chave: 'FIADOR_CPF', label: 'CPF do fiador' },
  { chave: 'FIADOR_RG', label: 'RG do fiador' },
  { chave: 'FIADOR_ENDERECO', label: 'Endereço do fiador' },
  { chave: 'FIADOR_TELEFONE', label: 'Telefone do fiador' },
  { chave: 'FIADOR_EMAIL', label: 'Email do fiador' },
  { chave: 'FIADOR_PROFISSAO', label: 'Profissão do fiador' },
  { chave: 'FIADOR_ESTADO_CIVIL', label: 'Estado civil do fiador' },
  { chave: 'FIADOR_CONJUGE_NOME', label: 'Nome do cônjuge/parceiro(a) do fiador' },
  { chave: 'FIADOR_CONJUGE_CPF', label: 'CPF do cônjuge/parceiro(a) do fiador' },
  { chave: 'FIADOR_CONJUGE_TELEFONE', label: 'Telefone do cônjuge/parceiro(a) do fiador' },
  { chave: 'BLOCO_ASSINATURA_FIADOR', label: 'Bloco de assinatura do fiador (some automaticamente quando a garantia não é fiança pessoal)' },
  { chave: 'BLOCO_ASSINATURA_FIADOR2', label: 'Bloco de assinatura do 2º fiador (só aparece quando um 2º fiador foi cadastrado)' },
  { chave: 'BLOCO_ASSINATURA_SOCIO_LOCATARIO', label: 'Assinatura do sócio/representante legal, quando o locatário é PJ' },
  { chave: 'GARANTIA_LOCATICIA_LABEL', label: 'Rótulo curto do tipo de garantia (CAUÇÃO, FIADOR, LOFT SEGURO LOCATÍCIO, LOFT GARANTIA INVESTE) - usado na Rescisão' },
  { chave: 'QUALIFICACAO_GARANTIA_VISTORIA_RESCISAO', label: 'Linha de identificação da garantia usada no Termo de Vistoria e na Rescisão' },
  { chave: 'ASSINANTES_ADICIONAIS', label: 'Assinantes adicionais (sócios, etc.)' },
  { chave: 'BLOCO_TESTEMUNHAS', label: 'Bloco de assinatura das 2 testemunhas (colunas alinhadas automaticamente)' },
  { chave: 'TESTEMUNHA1_NOME', label: 'Nome da testemunha 1' },
  { chave: 'TESTEMUNHA1_CPF', label: 'CPF da testemunha 1' },
  { chave: 'TESTEMUNHA2_NOME', label: 'Nome da testemunha 2' },
  { chave: 'TESTEMUNHA2_CPF', label: 'CPF da testemunha 2' },
  { chave: 'DATA_RESCISAO', label: 'Data da rescisão' },
  { chave: 'MOTIVO_RESCISAO', label: 'Motivo da rescisão' },
  { chave: 'MULTA_RESCISAO', label: 'Valor da multa de rescisão' },
  { chave: 'OBSERVACOES_RESCISAO', label: 'Observações da rescisão' },
  { chave: 'NOME_EMPRESA', label: 'Nome da imobiliária' },
  { chave: 'CNPJ_EMPRESA', label: 'CNPJ da imobiliária' },
  { chave: 'ENDERECO_EMPRESA', label: 'Endereço da imobiliária' },
  { chave: 'TELEFONE_EMPRESA', label: 'Telefone da imobiliária' },
  { chave: 'EMAIL_EMPRESA', label: 'Email da imobiliária' },
  { chave: 'CRECI', label: 'CRECI da imobiliária' },
  { chave: 'CORRETORA_NOME', label: 'Nome da corretora responsável' },
  { chave: 'CORRETORA_CPF', label: 'CPF da corretora responsável' },
  { chave: 'CORRETORA_RG', label: 'RG da corretora responsável' },
];

// Lista literal do Termo de Vistoria de referência (TERMO_DE_VISTORIA_DO_IMÓVEL_*.docx) -
// itens granulares por cômodo/sistema, avaliados individualmente como Ruim/Bom/N.A.
const ITENS_VISTORIA_PADRAO = [
  'Pintura externa', 'Pintura interna', 'Manchas', 'Rachadura', 'Umidade', 'Telhado', 'Teto',
  'Piso cozinha', 'Piso sala', 'Piso quartos', 'Piso Lavanderia', 'Piso WC', 'Rodapés',
  'Portas externas', 'Portas internas', 'Fechaduras', 'Janelas', 'Persianas', 'Grade', 'Cortinas',
  'Lâmpadas', 'Luminárias', 'Painel luz', 'Dicroicas', 'Espelhos',
  'Armário cozinha', 'Balcão pia', 'Torneira pia', 'Bancada', 'Mármore', 'Granito', 'Mesa Cozinha',
  'Box WC', 'Armário WC', 'Vaso Sanitário', 'Pia WC', 'Acessórios WC', 'Torneira WC', 'Chuveiro/Ducha',
  'Aquecedor a gás', 'Aquecedor elétrico', 'Ar Condicionado Sala', 'Ar Condicionado Quarto', 'Ar Condicionado Suíte',
  'Tanque lavanderia', 'Varal de roupas interno', 'Varal de roupas externo',
  'Churrasqueira', 'Garagem fechada', 'Garagem aberta', 'Piso garagem', 'Quintal', 'Jardim',
  'Muros', 'Grades', 'Portão', 'Portão eletrônico',
  'Rede hidráulica', 'Caixa d\'água', 'Caixa de gordura', 'Sumidouro', 'Rede elétrica',
  'Padrão Casan', 'Padrão Celesc', 'Alarme', 'Vigilância', 'Rua pavimentada', 'Rede esgoto',
  'Chaves', 'Controles',
];

// Gera a lista padrão de itens de vistoria, SEM avaliação pré-marcada
// (o admin precisa marcar Ruim/Bom/Novo/N.A. manualmente item por item)
function montarChecklistPadrao() {
  return { itens: ITENS_VISTORIA_PADRAO.map((item) => ({ item, avaliacao: null })), observacao: '' };
}

// Interpreta o campo checklistVistoria (JSON salvo) do contrato, com fallback pro padrão.
// Aceita tanto o formato novo ({ itens, observacao }) quanto o formato antigo (array puro
// de itens, sem observação) - contratos salvos antes dessa mudança continuam funcionando.
function interpretarChecklist(checklistVistoria) {
  if (!checklistVistoria) return montarChecklistPadrao();
  try {
    const dados = JSON.parse(checklistVistoria);
    if (Array.isArray(dados)) {
      return dados.length ? { itens: dados, observacao: '' } : montarChecklistPadrao();
    }
    if (dados && Array.isArray(dados.itens)) {
      return { itens: dados.itens.length ? dados.itens : ITENS_VISTORIA_PADRAO.map((item) => ({ item, avaliacao: null })), observacao: dados.observacao || '' };
    }
    return montarChecklistPadrao();
  } catch {
    return montarChecklistPadrao();
  }
}

const TEMPLATE_LOCACAO_RESIDENCIAL_PADRAO = `CONTRATO DE LOCAÇÃO DE IMÓVEL RESIDENCIAL
Contrato Nº {{NUMERO_CONTRATO}}

**LOCADOR: {{NOME_PROPRIETARIO}}**, {{NACIONALIDADE_PROPRIETARIO}}, {{ESTADO_CIVIL_PROPRIETARIO}}, {{PROFISSAO_PROPRIETARIO}}, CPF {{CPF_PROPRIETARIO}}, RG {{RG_PROPRIETARIO}}, Residente na {{ENDERECO_PROPRIETARIO}}{{QUALIFICACAO_REPRESENTANTE_PROPRIETARIO}}, doravante denominado LOCADOR, neste ato representado pela Imobiliária {{NOME_EMPRESA}}, CNPJ {{CNPJ_EMPRESA}}, CRECI {{CRECI}}, com escritório na {{ENDERECO_EMPRESA}}, para agir em poder em conjunto ou separadamente, doravante designado(a) neste instrumento abreviadamente ADMINISTRADORA, e de outra parte.

**LOCATÁRIO: {{NOME_INQUILINO}}**, Brasileiro(a), {{ESTADO_CIVIL_INQUILINO}}, {{QUALIFICACAO_PROFISSIONAL_INQUILINO}}, portador(a) do CPF/CNPJ nº {{CPF_INQUILINO}}, RG/IE nº {{RG_INQUILINO}}, telefone {{TELEFONE_INQUILINO}}, email {{EMAIL_INQUILINO}}, Residente na {{ENDERECO_INQUILINO}}{{QUALIFICACAO_REPRESENTANTE_INQUILINO}}, denominado neste instrumento abreviadamente LOCATÁRIO.

{{QUALIFICACAO_GARANTIA}}

A Imobiliária, neste ato e na qualidade de representante do Locador, declara expressamente que confere à Empresa de Cobrança ou ao advogado por ela indicado, amplos poderes para fins de notificação do(s) Locatário(s) Fiador(a) e desocupação do imóvel.

{{CLAUSULAS_ADICIONAIS}}
**IMÓVEL: {{TIPO_IMOVEL}} "{{NOME_IMOVEL}}"**, situado em {{ENDERECO_IMOVEL}}, {{CIDADE_IMOVEL}}/{{ESTADO_IMOVEL}}, CEP {{CEP_IMOVEL}}, mediante as cláusulas e condições seguintes:

Características do imóvel: {{DESCRICAO_IMOVEL}}

**(O Termo de Vistoria de entrada e entrega de chaves inicial na data de {{DATA_VISTORIA_INICIAL}}, assinado pelas partes, integra o contrato de locação, as fotos desta vistoria estão anexadas ao Termo e encaminhadas nos endereços de e-mail das partes, ##{{EMAILS_PARTES}}##. O(A) Locatário(a) tem até 7 dias corridos para alguma contestação caso julgue necessário.)**

CLÁUSULA PRIMEIRA: O prazo de locação é de 1 (um) ano tendo início em {{DATA_INICIO}} com o término em {{DATA_FIM}}, cessando de pleno direito neste último dia independente de aviso, notificação, interpelação judicial ou extrajudicial, obrigando-se o(s) Locatário(s) a desocupar o imóvel locado, entregando-o nas condições previstas neste instrumento.
Caso, ao término do prazo contratual, o LOCATÁRIO permaneça no imóvel sem oposição do LOCADOR, a locação será automaticamente prorrogada por prazo indeterminado, nos termos do art. 46, §1º da Lei 8.245/91.

Do Valor da Locação
CLÁUSULA SEGUNDA: O valor do aluguel é de {{VALOR_ALUGUEL}}, reajustado anualmente pela variação do **{{INDICE_REAJUSTE}}**, ou outro índice oficial que venha a substituí-lo. Pagamento em moeda corrente nacional a ser realizado até {{DIA_VENCIMENTO}} de cada mês por Chave Pix {{CHAVE_PIX_EMPRESA}} Banco {{BANCO_EMPRESA}} Ag {{AGENCIA_EMPRESA}} Conta {{CONTA_EMPRESA}}, ou outro meio indicado pela Administradora, independentemente de qualquer aviso, notificação, interpelação judicial ou extrajudicial, sob pena de sujeitar-se ao pagamento de taxa de cobrança e ação de despejo por falta de pagamento. Após o pagamento a Imobiliária envia recibo de quitação, ou caso haja a necessidade de emissão de boleto.
Primeiro pagamento refere-se ao mês de {{MES_ANO_PRIMEIRO_PAGAMENTO}} programado para o dia da assinatura do contrato e com os vencimentos subsequentes a partir do mês {{MES_ANO_PAGAMENTOS_SEGUINTES}}.
{{OBSERVACAO_ALUGUEL_PROPORCIONAL}}
{{DESPESAS_ADICIONAIS}}
Parágrafo primeiro: A locação não iniciada no primeiro dia do mês ficará sujeita ao acerto dos dias decorridos até o final do mês, observados os prazos previstos na cláusula primeira.
Parágrafo segundo: O pagamento do aluguel realizado após o vencimento será acrescido de multa, juros e correção: multa moratória de 2% (dois por cento) sobre o valor do débito; juros de 1% (um por cento) ao mês; correção monetária pelo índice contratado.

Das Obrigações do Locatário
CLÁUSULA TERCEIRA: Salvo disposição em contrário nas cláusulas adicionais, os consumos de água, luz, IPTU e gás serão de responsabilidade do Locatário. No caso de incêndio no imóvel o prejuízo será de quem decorrer a culpa ou negligência. O seguro residencial o locatário poderá contratar com a seguradora de sua preferência, com coberturas mínimas de incêndio e vendaval, apresentando cópia da apólice à Imobiliária.
Parágrafo primeiro: Será de responsabilidade do Locatário ou Fiador a confecção de novas chaves ou troca de segredos, podendo utilizar as remanescentes sob sua responsabilidade.
Parágrafo segundo: Será de responsabilidade do Locatário(a) a mudança de titularidade/usuário das contas de consumo (água, luz, gás), quando aplicável.
Parágrafo terceiro: Será de responsabilidade do Locatário(a) seguir rigorosamente o estatuto do condomínio, quando houver, que será entregue na vistoria de entrada com as chaves e controles de acesso.

CLÁUSULA QUARTA: O imóvel descrito no preâmbulo deste contrato destina-se exclusivamente para fins RESIDENCIAL, destinação esta que não poderá ser substituída ou acrescida de qualquer outra, sem prévia e escrita autorização do(a) Locador(a).

CLÁUSULA QUINTA: O(s) Locatário(s) não poderão fazer no imóvel ora locado, ou em suas dependências, quaisquer obras ou benfeitorias, sem prévio e expresso consentimento manifestado por escrito pelo(a) Locador(a), não tendo direito a qualquer retenção ou indenização por quaisquer obras ou benfeitorias, e que no final da locação não convierem ao(a) Locador(a) permanecerem no imóvel ou suas dependências, deverá o(a) Locatário(a) removê-las a sua custa, deixando o imóvel e suas dependências no mesmo estado em que se achavam antes da locação, com base no Artigo 578 do Código Civil.
Parágrafo único: O Locatário obriga-se a manter o imóvel e dependências interna/externas, conforme vistoria objeto deste contrato, sempre limpo durante a locação, conforme o Artigo 569 do Código Civil; o(s) Locatário(s) também faculta(m) ao Locador o exame e vistoria do imóvel locado quando este julgar necessário, em dia e hora previamente acordados, para fim de verificar seu estado de conservação.

Da Transferência ou Sublocação
CLÁUSULA SEXTA: O referido imóvel não pode ser sublocado no todo ou em parte, sob pena de rescisão de contrato e pagamento de multa equivalente a 03 (três) aluguéis vigentes na data da infração.

Obrigações da Rescisão de Contrato
CLÁUSULA SÉTIMA: O Locatário declara ter recebido o imóvel ora locado, bem como seus acessórios, em boas condições de uso em toda a sua extensão.
**Parágrafo primeiro: É obrigação do Locatário apresentar à Imobiliária o aviso prévio por escrito da sua provável data de desocupação do imóvel com no mínimo 30 dias de antecedência, conforme lei do inquilinato (quando o contrato estiver em prazo indeterminado ou renovado após os 12 (doze) meses; caso contrário, será cobrado 30 dias de aluguel). Caso a desocupação ocorra antes dos 12 (doze) meses, o(s) Locatário(s) incorrerão em multa equivalente a 3 (três) meses de aluguel, conforme art. 4º, inciso II, da Lei nº 8.245/1991.**

CLÁUSULA OITAVA: Na rescisão, o imóvel, suas dependências e utensílios próprios serão restituídos nas mesmas condições recebidas; o Locatário deverá restituir o imóvel no perfeito estado de conservação, inteiramente livre, sem adesivos ou placas de identificação, pintado com a mesma cor interna, desfazendo as alterações que realizou, e desocupado; caso contrário, o aluguel continuará a correr até que o(a) Locatário(a) cumpra todas as exigências, apresentando ao(a) Locador(a) os comprovantes de pagamento das taxas de acordo com a cláusula terceira, bem como de qualquer outro encargo de sua responsabilidade.
Parágrafo primeiro: O LOCATÁRIO responderá pelos reparos decorrentes do uso normal do imóvel (manutenção diária), cabendo ao LOCADOR os reparos estruturais ou decorrentes de vícios anteriores à locação.
Parágrafo segundo: Caso os reparos exigidos pelo Locador(a) não sejam executados no prazo de 10 (dez) dias da rescisão, o Locatário obriga-se a depositar diretamente aos procuradores, ou onde estes indicarem, o valor correspondente ao orçamento apresentado pelo administrador. Não sendo executados os reparos nem depositado o valor do orçamento, na forma e prazo acima fixados, poderá o(a) Locador(a) ou a Administradora, se assim o desejar, mandar executar os reparos.
Parágrafo terceiro: Ocorrendo a hipótese prevista no presente contrato, muito embora a obrigação do(s) Locatário(s) de continuar pagando os aluguéis e acessórios, não terá o direito de voltar a ocupar o imóvel cujas chaves foram entregues. Se assim o fizer, poderá contra ele(a) ser movida ação de reintegração de posse, com a expedição da liminar sujeitando-se às perdas e danos que se apurarem, das responsabilidades e obrigações assumidas neste contrato.

CLÁUSULA NONA: Na falta do cumprimento de qualquer uma das cláusulas deste contrato, sujeitará o infrator ao pagamento de uma multa de 3 (três) vezes o valor do aluguel, na data da infração, em benefício da parte prejudicada, sem prejuízo da responsabilidade das obrigações assumidas neste contrato e dos honorários advocatícios, estes na base de 20% (vinte por cento) do valor da causa e custas processuais.
Parágrafo primeiro: Em caso de rescisão antecipada pelo LOCATÁRIO antes do prazo contratual, será devida multa equivalente a 3 (três) aluguéis, calculada proporcionalmente ao período restante do contrato, conforme art. 4º da Lei do Inquilinato.
Parágrafo segundo: Em caso de venda do imóvel durante a vigência do contrato, o LOCATÁRIO terá direito de preferência para aquisição nas mesmas condições ofertadas a terceiros, devendo manifestar-se no prazo de 30 dias, conforme art. 27 da Lei 8.245/91.
Parágrafo terceiro: Os honorários advocatícios fixados nesta cláusula serão devidos inclusive nas ações de despejo eventualmente movidas contra o(s) Locatário(s) por falta de pagamento de aluguéis e/ou outros encargos.
Parágrafo quarto: A rescisão contratual se dará mediante distrato de locação, assinado por ambas as partes.

Outras Disposições
CLÁUSULA DÉCIMA: Caracterizará grave infração contratual, podendo o(a) Locador(a) dar como rescindido de pleno direito, independentemente de qualquer interpelação judicial ou extrajudicial, o presente contrato sem que assista ao(s) Locatário(s) direito a qualquer indenização: A) Se o(s) Locatário(s) não pagar(em) pontualmente quaisquer das prestações mensais do aluguel ou faltar ao cumprimento de qualquer obrigação assumida; B) Se ocorrer incêndio no imóvel, exceto quando decorrente de culpa ou negligência do locatário, dolo, caso fortuito ou de força maior; C) Se o(s) Locatário(s) usar(em) o objeto deste contrato para fim diverso daquele para o qual foi locado; D) Se o(s) Locatário(s) deixar(em) de observar quaisquer exigências do regulamento interno do edifício.

CLÁUSULA DÉCIMA PRIMEIRA: É vedado ao(s) Locatário(s), sem prévio consentimento por escrito do(a) Locador(a), colocar placas, bandeiras, cartazes, ou quaisquer inscrições ou sinais, aparelhos de ar condicionado em ambientes sem autorização do Locador.

CLÁUSULA DÉCIMA SEGUNDA: O Locador(a) não responderá em nenhum caso por quaisquer danos que venha a sofrer o(s) Locatário(s) em razão do derramamento de líquidos (água de rompimento de encanamento, de chuva, de despejo de torneiras etc.), incêndio, casos fortuitos ou de força maior, a não ser em caso de falha no projeto de instalação ou falta de manutenção/benfeitorias necessárias.

CLÁUSULA DÉCIMA TERCEIRA: O Locatário não terá direito a reter o pagamento do aluguel/caução/fiador ou qualquer outra quantia devida nos termos do presente contrato, sob a alegação de não terem sido atendidas exigências porventura solicitadas.

CLÁUSULA DÉCIMA QUARTA: Não poderá o Locatário recusar-se ao pagamento de quaisquer diferenças de aluguel, taxas, ou outros ônus a que estiver obrigado nos termos da lei e do presente instrumento, sob a alegação de que o pagamento não lhe foi exigido na época fixada neste contrato.

CLÁUSULA DÉCIMA QUINTA: Quaisquer tolerâncias ou concessões do(a) Locador(a) para com o(s) Locatário(s), quando não manifestadas por escrito, não constituirão precedentes invocáveis por este e não terão a virtude de alterar obrigações assumidas neste instrumento.

{{CLAUSULA_GARANTIA}}

CLÁUSULA DÉCIMA OITAVA - SIGILO, CONFIDENCIALIDADE E PROTEÇÃO DE DADOS PESSOAIS:
1. Confidencialidade: As partes comprometem-se a manter em absoluto sigilo todas as informações obtidas em razão deste contrato, incluindo, mas não se limitando a, dados pessoais, informações cadastrais, financeiras, contratuais ou quaisquer documentos fornecidos, não os divulgando a terceiros sem prévia autorização expressa da parte titular, exceto quando exigido por lei ou ordem judicial.
2. Tratamento de Dados Pessoais: O LOCADOR declara que os dados pessoais fornecidos pelo LOCATÁRIO serão tratados em estrita conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados - LGPD), utilizando-os única e exclusivamente para finalidades relacionadas à execução deste contrato, tais como cadastro, cobrança, comunicação, verificação de crédito e cumprimento de obrigações legais.
3. Obrigações do Locatário: O LOCATÁRIO obriga-se a manter confidenciais quaisquer informações pessoais ou comerciais do LOCADOR a que venha a ter acesso em razão deste contrato, incluindo dados bancários, contratos e documentos de propriedade.
4. Medidas de Segurança: Ambas as partes se comprometem a adotar medidas técnicas e administrativas razoáveis para proteger os dados pessoais e informações confidenciais, responsabilizando-se por qualquer dano decorrente de uso indevido ou divulgação não autorizada.
5. Vigência da Confidencialidade: As obrigações de sigilo e confidencialidade previstas nesta cláusula permanecerão em vigor mesmo após a extinção deste contrato, pelo prazo mínimo de cinco (5) anos, sem prejuízo de demais disposições legais aplicáveis.

CLÁUSULA DÉCIMA NONA: Para as questões resultantes deste contrato, será competente o foro da cidade sede do imóvel, renunciando as partes contratantes a qualquer outro, seja qual for o seu futuro domicílio.

FIM

{{CIDADE_ESTADO_IMOVEL}}, {{DATA_HOJE}}.



_________________________________
{{NOME_PROPRIETARIO}}
Locador(a)
{{ASSINATURA_CONJUGE_PROPRIETARIO}}
{{BLOCO_ASSINATURA_SOCIO_PROPRIETARIO}}

















_________________________________
{{NOME_EMPRESA}}
Corretora - CRECI {{CRECI}}

















_________________________________
{{NOME_INQUILINO}}
Locatário(a)
{{BLOCO_ASSINATURA_SOCIO_LOCATARIO}}

















{{BLOCO_ASSINATURA_FIADOR}}
{{BLOCO_ASSINATURA_FIADOR2}}
{{ASSINANTES_ADICIONAIS}}

Testemunhas:



{{BLOCO_TESTEMUNHAS}}`;

const TEMPLATE_LOCACAO_COMERCIAL_PADRAO = `CONTRATO DE LOCAÇÃO DE IMÓVEL COMERCIAL
Contrato Nº {{NUMERO_CONTRATO}}

**LOCADOR: {{NOME_PROPRIETARIO}}**, {{NACIONALIDADE_PROPRIETARIO}}, {{ESTADO_CIVIL_PROPRIETARIO}}, {{PROFISSAO_PROPRIETARIO}}, CPF {{CPF_PROPRIETARIO}}, RG {{RG_PROPRIETARIO}}, residente em {{ENDERECO_PROPRIETARIO}}, telefone {{TELEFONE_PROPRIETARIO}}, email {{EMAIL_PROPRIETARIO}}{{QUALIFICACAO_REPRESENTANTE_PROPRIETARIO}}, doravante denominado LOCADOR, neste ato representado pela Imobiliária {{NOME_EMPRESA}}, CNPJ {{CNPJ_EMPRESA}}, CRECI {{CRECI}}, com escritório em {{ENDERECO_EMPRESA}}, doravante designada abreviadamente INTERMEDIADORA.

**LOCATÁRIA: {{NOME_INQUILINO}}**, {{QUALIFICACAO_PROFISSIONAL_INQUILINO}}, CPF/CNPJ nº {{CPF_INQUILINO}}, RG/IE nº {{RG_INQUILINO}}, telefone {{TELEFONE_INQUILINO}}, email {{EMAIL_INQUILINO}}, com sede/residência em {{ENDERECO_INQUILINO}}{{QUALIFICACAO_REPRESENTANTE_INQUILINO}}, doravante denominada LOCATÁRIA.

{{QUALIFICACAO_GARANTIA}}

{{CLAUSULAS_ADICIONAIS}}
**IMÓVEL: {{TIPO_IMOVEL}} "{{NOME_IMOVEL}}"**, situado em {{ENDERECO_IMOVEL}}, {{CIDADE_IMOVEL}}/{{ESTADO_IMOVEL}}, CEP {{CEP_IMOVEL}}, mediante as cláusulas e condições seguintes:

Características do imóvel: {{DESCRICAO_IMOVEL}}

CLÁUSULA PRIMEIRA - DO PRAZO
O prazo de locação vigorará da data de {{DATA_INICIO}} até {{DATA_FIM}}, cessando de pleno direito neste último dia, independente de aviso, notificação, interpelação judicial ou extrajudicial, obrigando-se a LOCATÁRIA a desocupar o imóvel, entregando-o nas condições previstas neste instrumento. Caso, ao término do prazo contratual, a LOCATÁRIA permaneça no imóvel sem oposição do LOCADOR, a locação será automaticamente prorrogada por prazo indeterminado, nos termos do art. 46, §1º da Lei 8.245/91.

CLÁUSULA SEGUNDA - DO VALOR DA LOCAÇÃO
O valor do aluguel é de {{VALOR_ALUGUEL}}, reajustado anualmente pela variação do **{{INDICE_REAJUSTE}}**, ou outro índice oficial que venha a substituí-lo, pagamento em moeda corrente nacional a ser realizado até {{DIA_VENCIMENTO}} de cada mês, via chave PIX {{CHAVE_PIX_EMPRESA}} Banco {{BANCO_EMPRESA}} Ag {{AGENCIA_EMPRESA}} Conta {{CONTA_EMPRESA}} ou outro meio indicado pela Administradora, independentemente de qualquer aviso, notificação, interpelação judicial ou extrajudicial, sob pena de sujeitar-se ao pagamento de taxa de cobrança e ação de despejo por falta de pagamento. Após o pagamento, a Imobiliária envia recibo de quitação.
{{OBSERVACAO_ALUGUEL_PROPORCIONAL}}
{{DESPESAS_ADICIONAIS}}

Parágrafo primeiro: A locação não iniciada no primeiro dia do mês ficará sujeita ao acerto dos dias decorridos até o final do mês, observados os prazos previstos na cláusula primeira.
Parágrafo segundo: O pagamento do aluguel após o vencimento ficará sujeito a multa moratória de 2% (dois por cento) sobre o valor do débito, juros de 1% (um por cento) ao mês e correção monetária pelo índice contratado. O comprovante bancário servirá como prova suficiente de quitação.

CLÁUSULA TERCEIRA - DA CAUÇÃO
Fica estipulado o valor de caução de {{CAUCAO}}, a ser devolvido ao término do contrato, desde que constatada a ausência de danos ao imóvel e de débitos pendentes.

CLÁUSULA QUARTA - DAS OBRIGAÇÕES DA LOCATÁRIA
Ao valor do aluguel, a LOCATÁRIA obriga-se a pagar, a partir do início da locação e até a devolução do imóvel, o IPTU, as despesas de água, energia elétrica, esgoto e despesas condominiais ordinárias, fornecendo ao LOCADOR cópias dos comprovantes de pagamento quando solicitado, além de providenciar a mudança de titularidade das contas de consumo. É de responsabilidade da LOCATÁRIA a confecção de novas chaves ou troca de segredos. A LOCATÁRIA fica obrigada, nos termos do art. 22, VIII, da Lei nº 8.245/91, a manter seguro do imóvel contra incêndio durante todo o prazo da locação, tendo o LOCADOR como beneficiário.

CLÁUSULA QUINTA - DA DESTINAÇÃO DO IMÓVEL
O imóvel destina-se exclusivamente para fins COMERCIAIS, conforme atividade e objeto social da LOCATÁRIA, destinação esta que não poderá ser substituída ou acrescida de qualquer outra sem prévia e escrita autorização do LOCADOR.

CLÁUSULA SEXTA - DAS BENFEITORIAS
A LOCATÁRIA não poderá fazer no imóvel, ou em suas dependências, quaisquer obras ou benfeitorias sem prévio e expresso consentimento por escrito do LOCADOR, não tendo direito a qualquer retenção ou indenização por elas; benfeitorias que não convierem ao LOCADOR ao final da locação deverão ser removidas às custas da LOCATÁRIA.

CLÁUSULA SÉTIMA - DA SUBLOCAÇÃO
O imóvel não pode ser sublocado no todo ou em parte, sob pena de rescisão do contrato e multa equivalente a 3 (três) aluguéis vigentes na data da infração.

CLÁUSULA OITAVA - DA ENTREGA E REGULARIZAÇÃO DO IMÓVEL
O LOCADOR declara entregar o imóvel em regular situação de uso e conservação, com instalações elétricas e hidráulicas em funcionamento, conforme Termo de Vistoria de Entrada anexo, comprometendo-se a mantê-lo regularizado perante os órgãos municipais, estaduais e federais competentes, sendo de sua responsabilidade a documentação necessária à obtenção do alvará de funcionamento da LOCATÁRIA. Havendo pendência impeditiva ao exercício da atividade da LOCATÁRIA, o LOCADOR deverá regularizá-la em até 90 (noventa) dias corridos, sob pena de rescisão sem ônus para a LOCATÁRIA.

CLÁUSULA NONA - DA RESTITUIÇÃO DO IMÓVEL
Na rescisão, o imóvel deverá ser restituído no perfeito estado de conservação, livre de adesivos ou placas de identificação, conforme Termo de Vistoria de Saída a ser realizado, ressalvado o desgaste natural decorrente do uso regular.

CLÁUSULA DÉCIMA - DAS PENALIDADES
Na falta do cumprimento de qualquer cláusula deste contrato, o infrator sujeita-se ao pagamento de multa equivalente a 3 (três) vezes o valor do aluguel vigente, sem prejuízo das obrigações assumidas e dos honorários advocatícios devidos (20% sobre o valor da causa).

Parágrafo primeiro: Em caso de rescisão antecipada pela LOCATÁRIA antes do prazo contratual, será devida multa equivalente a 3 (três) aluguéis, calculada proporcionalmente ao período restante, conforme art. 4º da Lei nº 8.245/91.
Parágrafo segundo: Em caso de venda do imóvel durante a vigência do contrato, a LOCATÁRIA terá direito de preferência para aquisição nas mesmas condições ofertadas a terceiros, conforme art. 27 da Lei nº 8.245/91.

{{CLAUSULA_GARANTIA}}

CLÁUSULA DÉCIMA SEGUNDA - SIGILO, CONFIDENCIALIDADE E PROTEÇÃO DE DADOS PESSOAIS
As partes comprometem-se a manter em absoluto sigilo todas as informações obtidas em razão deste contrato, incluindo dados pessoais, cadastrais, financeiros e contratuais, tratando-os em conformidade com a Lei nº 13.709/2018 (LGPD), exclusivamente para os fins deste contrato.

CLÁUSULA DÉCIMA TERCEIRA - DO FORO
Para as questões resultantes deste contrato, será competente o foro da cidade sede do imóvel, renunciando as partes a qualquer outro, seja qual for o seu futuro domicílio.

E por estarem assim justos e contratados, firmam o presente instrumento na presença das testemunhas abaixo.

{{CIDADE_ESTADO_IMOVEL}}, {{DATA_HOJE}}.


_________________________________
{{NOME_PROPRIETARIO}}
Locador(a)
{{ASSINATURA_CONJUGE_PROPRIETARIO}}
{{BLOCO_ASSINATURA_SOCIO_PROPRIETARIO}}

















_________________________________
{{NOME_EMPRESA}}
Corretora - CRECI {{CRECI}}

















_________________________________
{{NOME_INQUILINO}}
Locatária
{{BLOCO_ASSINATURA_SOCIO_LOCATARIO}}

















{{BLOCO_ASSINATURA_FIADOR}}
{{BLOCO_ASSINATURA_FIADOR2}}
{{ASSINANTES_ADICIONAIS}}

Testemunhas:

{{BLOCO_TESTEMUNHAS}}`;

const TEMPLATE_INTERMEDIACAO_PADRAO = `CONTRATO DE INTERMEDIAÇÃO IMOBILIÁRIA PARA FINS DE ADMINISTRAÇÃO
Contrato Nº {{NUMERO_CONTRATO}}

Por este instrumento particular, as partes qualificadas abaixo têm entre si justas e acertadas a presente relação contratual:

CLÁUSULA 1ª - QUALIFICAÇÃO DAS PARTES

**PROPRIETÁRIO(A) / LOCADOR(A): {{NOME_PROPRIETARIO}}**, {{NACIONALIDADE_PROPRIETARIO}}, {{ESTADO_CIVIL_PROPRIETARIO}}, {{PROFISSAO_PROPRIETARIO}}, CPF {{CPF_PROPRIETARIO}}, RG {{RG_PROPRIETARIO}}, residente em {{ENDERECO_PROPRIETARIO}}, telefone {{TELEFONE_PROPRIETARIO}}, email {{EMAIL_PROPRIETARIO}}{{QUALIFICACAO_REPRESENTANTE_PROPRIETARIO}}, doravante denominado LOCADOR.

ADMINISTRADORA: {{NOME_EMPRESA}}, CNPJ {{CNPJ_EMPRESA}}, CRECI {{CRECI}}, com escritório em {{ENDERECO_EMPRESA}}, representada pela corretora de imóveis {{CORRETORA_NOME}}, CPF {{CORRETORA_CPF}}, RG {{CORRETORA_RG}}.

CLÁUSULA 2ª - DO OBJETO
O PROPRIETÁRIO entrega à ADMINISTRADORA o imóvel a seguir descrito, de sua propriedade, para gerir e administrar segundo os preceitos éticos e legais: {{TIPO_IMOVEL}} situado em {{ENDERECO_IMOVEL}}, {{CIDADE_IMOVEL}}/{{ESTADO_IMOVEL}}, CEP {{CEP_IMOVEL}}.

CLÁUSULA 3ª - DOS PODERES DA ADMINISTRADORA
A ADMINISTRADORA fica investida em todos os poderes necessários para contratar locações, receber aluguéis e encargos locatícios, passando os respectivos recibos.

CLÁUSULA 4ª - DA REMUNERAÇÃO
O PROPRIETÁRIO pagará à ADMINISTRADORA, pelos serviços ora contratados, taxa de administração mensal no valor de {{PERCENTUAL_COMISSAO}}, calculado sobre o valor total do aluguel recebido.

Parágrafo primeiro: Fica desde já ajustado que a ADMINISTRADORA cobrará do PROPRIETÁRIO o valor de {{PERCENTUAL_INTERMEDIACAO}} sobre o valor do aluguel, com desconto no primeiro pagamento locatício, a título de honorários pela intermediação da locação.
Parágrafo segundo: O pagamento mensal da ADMINISTRADORA previsto nesta cláusula acompanhará todo e qualquer reajuste do valor do aluguel, seja qual for o motivo.
Parágrafo terceiro: Descontos por qualquer finalidade oferecidos ao LOCATÁRIO referentes ao primeiro pagamento da locação não exoneram o PROPRIETÁRIO de repassar a diferença do valor total à ADMINISTRADORA.

CLÁUSULA 5ª - DA PRESTAÇÃO DE CONTAS
A ADMINISTRADORA prestará contas mensais ao PROPRIETÁRIO, efetuando o pagamento correspondente deduzida a taxa de administração, via Chave PIX {{CHAVE_PIX_PROPRIETARIO}}, Banco {{BANCO_PROPRIETARIO}} Ag {{AGENCIA_PROPRIETARIO}} CC {{CONTA_PROPRIETARIO}}.

CLÁUSULA 6ª - DA SELEÇÃO DE LOCATÁRIOS
A ADMINISTRADORA deverá escolher os futuros locatários com a mais absoluta cautela, utilizando todas as formas possíveis para verificar a idoneidade dos mesmos e de seus fiadores, não podendo, porém, ser responsabilizada por eventuais prejuízos decorrentes de falta de pagamento, danos ao imóvel ou insolvência dos fiadores.

CLÁUSULA 7ª - DA REPRESENTAÇÃO
O PROPRIETÁRIO outorgará, através de instrumento particular, procuração específica para que a ADMINISTRADORA possa representá-lo judicial ou extrajudicialmente. Caso seja necessária a abertura de demanda judicial, todas as custas, inclusive contratação de advogado, correrão por conta do PROPRIETÁRIO.

CLÁUSULA 8ª - DO PRAZO
O presente contrato é celebrado por prazo indeterminado, podendo ser rescindido por qualquer das partes mediante aviso prévio por escrito com antecedência mínima de 30 (trinta) dias.

CLÁUSULA 9ª - DO SUBSTABELECIMENTO
A ADMINISTRADORA poderá substabelecer os direitos deste contrato havendo justo motivo, comunicando previamente o fato ao PROPRIETÁRIO.

CLÁUSULA 10ª - DO FORO
As partes elegem o foro da comarca do imóvel para dirimir qualquer dúvida sobre este instrumento.

E por estarem assim justos e contratados, as partes assinam o presente instrumento na presença de testemunhas.

{{CIDADE_ESTADO_IMOVEL}}, {{DATA_HOJE}}.


_________________________________
{{NOME_EMPRESA}}
Administradora - CRECI {{CRECI}}

















_________________________________
{{NOME_PROPRIETARIO}}
Proprietário(a) / Locador(a)
{{ASSINATURA_CONJUGE_PROPRIETARIO}}
{{BLOCO_ASSINATURA_SOCIO_PROPRIETARIO}}

















{{ASSINANTES_ADICIONAIS}}

Testemunhas:

{{BLOCO_TESTEMUNHAS}}`;

const TEMPLATE_VISTORIA_INICIAL_PADRAO = `TERMO DE VISTORIA DE ENTRADA E ENTREGA DAS CHAVES DO IMÓVEL
Contrato Nº {{NUMERO_CONTRATO}}

**LOCADOR: {{NOME_PROPRIETARIO}}**, {{NACIONALIDADE_PROPRIETARIO}}, {{ESTADO_CIVIL_PROPRIETARIO}}, {{PROFISSAO_PROPRIETARIO}}, CPF {{CPF_PROPRIETARIO}}, RG {{RG_PROPRIETARIO}}, Residente na {{ENDERECO_PROPRIETARIO}}{{QUALIFICACAO_REPRESENTANTE_PROPRIETARIO}}, doravante denominado LOCADOR, neste ato representado pela Imobiliária {{NOME_EMPRESA}}, CNPJ {{CNPJ_EMPRESA}}, CRECI {{CRECI}}, com escritório em {{ENDERECO_EMPRESA}}, doravante designada abreviadamente INTERMEDIADORA.

**LOCATÁRIO(A): {{NOME_INQUILINO}}**, estado civil {{ESTADO_CIVIL_INQUILINO}}, {{QUALIFICACAO_PROFISSIONAL_INQUILINO}}, portador(a) do CPF/CNPJ nº {{CPF_INQUILINO}}, RG/IE nº {{RG_INQUILINO}}, telefone {{TELEFONE_INQUILINO}}, email {{EMAIL_INQUILINO}}, residente em {{ENDERECO_INQUILINO}}{{QUALIFICACAO_REPRESENTANTE_INQUILINO}}, doravante denominado(a) LOCATÁRIO(A).

**{{QUALIFICACAO_GARANTIA_VISTORIA_RESCISAO}}**

**IMÓVEL: {{TIPO_IMOVEL}} "{{NOME_IMOVEL}}"**, situado em {{ENDERECO_IMOVEL}}, {{CIDADE_IMOVEL}}/{{ESTADO_IMOVEL}}, CEP {{CEP_IMOVEL}}, mediante as cláusulas e condições seguintes:

Características do imóvel: {{DESCRICAO_IMOVEL}}

**(O Termo de vistoria assinado pelas partes, integra o contrato de locação, as fotos desta vistoria estão anexadas ao Termo e encaminhadas nos endereços de e-mail das partes, ##{{EMAILS_PARTES}}##. O(A) LOCATÁRIO(A) tem até 7 dias corridos para alguma contestação caso julgue necessário.)**

O presente termo é parte integrante do contrato de locação celebrado entre as partes. As fotos desta vistoria estão anexadas aos e-mails acima informados.

Responsabilidade do LOCATÁRIO por danos decorrentes de mau uso, negligência ou modificações realizadas pelo locatário deverão ser reparados antes da devolução do imóvel, ressalvado o desgaste natural decorrente do uso regular do imóvel. O Imóvel deverá ser devolvido limpo, nas mesmas condições de higiene em que foi entregue.

Pelo presente, declaram as partes, que o imóvel acima indicado se encontra conforme a lista abaixo e com todos os acessórios em de funcionamento e conservação, sendo que dessa forma o Imóvel deverá ser devolvido nas mesmas condições descritas neste termo, ressalvado o desgaste natural pelo uso, sendo realizada vistoria final para conferência.

{{CHECKLIST_VISTORIA_INICIAL}}

Qualquer dúvida ou reclamação ao presente laudo deverá ser comunicada ao LOCADOR por escrito, dentro de 07 dias corridos a contar da data da assinatura deste, destinado ao e-mail {{EMAIL_EMPRESA}}. A falta de comunicação implica em aceitação de vistoria realizada nos termos descritos acima.

E, por assim estarem justos e de acordo, firmam o presente instrumento em duas vias de igual teor e forma.

{{CIDADE_ESTADO_IMOVEL}}, {{DATA_VISTORIA_INICIAL}}.


_________________________________
{{NOME_PROPRIETARIO}}
Locador(a)
{{ASSINATURA_CONJUGE_PROPRIETARIO}}
{{BLOCO_ASSINATURA_SOCIO_PROPRIETARIO}}

















_________________________________
{{NOME_EMPRESA}}
Corretora - CRECI {{CRECI}}

















_________________________________
{{NOME_INQUILINO}}
Locatário(a)
{{BLOCO_ASSINATURA_SOCIO_LOCATARIO}}

















{{BLOCO_ASSINATURA_FIADOR}}
{{BLOCO_ASSINATURA_FIADOR2}}
{{ASSINANTES_ADICIONAIS}}

Testemunhas:

{{BLOCO_TESTEMUNHAS}}`;

const TEMPLATE_VISTORIA_FINAL_PADRAO = `TERMO DE VISTORIA DE SAÍDA E DEVOLUÇÃO DAS CHAVES DO IMÓVEL
Contrato Nº {{NUMERO_CONTRATO}}

**LOCADOR: {{NOME_PROPRIETARIO}}**, {{NACIONALIDADE_PROPRIETARIO}}, {{ESTADO_CIVIL_PROPRIETARIO}}, {{PROFISSAO_PROPRIETARIO}}, CPF {{CPF_PROPRIETARIO}}, RG {{RG_PROPRIETARIO}}, Residente na {{ENDERECO_PROPRIETARIO}}{{QUALIFICACAO_REPRESENTANTE_PROPRIETARIO}}, doravante denominado LOCADOR, neste ato representado pela Imobiliária {{NOME_EMPRESA}}, CNPJ {{CNPJ_EMPRESA}}, CRECI {{CRECI}}, com escritório em {{ENDERECO_EMPRESA}}, doravante designada abreviadamente INTERMEDIADORA.

**LOCATÁRIO(A): {{NOME_INQUILINO}}**, estado civil {{ESTADO_CIVIL_INQUILINO}}, {{QUALIFICACAO_PROFISSIONAL_INQUILINO}}, portador(a) do CPF/CNPJ nº {{CPF_INQUILINO}}, RG/IE nº {{RG_INQUILINO}}, telefone {{TELEFONE_INQUILINO}}, email {{EMAIL_INQUILINO}}, residente em {{ENDERECO_INQUILINO}}{{QUALIFICACAO_REPRESENTANTE_INQUILINO}}, doravante denominado(a) LOCATÁRIO(A).

**{{QUALIFICACAO_GARANTIA_VISTORIA_RESCISAO}}**

**IMÓVEL: {{TIPO_IMOVEL}} "{{NOME_IMOVEL}}"**, situado em {{ENDERECO_IMOVEL}}, {{CIDADE_IMOVEL}}/{{ESTADO_IMOVEL}}, CEP {{CEP_IMOVEL}}, mediante as cláusulas e condições seguintes:

Características do imóvel: {{DESCRICAO_IMOVEL}}

**(O Termo de vistoria assinado pelas partes, integra o contrato de locação, as fotos desta vistoria estão anexadas ao Termo e encaminhadas nos endereços de e-mail das partes, ##{{EMAILS_PARTES}}##. O(A) LOCATÁRIO(A) tem até 7 dias corridos para alguma contestação caso julgue necessário.)**

O presente termo é parte integrante do contrato de locação celebrado entre as partes, registrando o estado de devolução do imóvel para fins de comparação com o Termo de Vistoria de Entrada. As fotos desta vistoria estão anexadas aos e-mails acima informados.

Responsabilidade do LOCATÁRIO por danos decorrentes de mau uso, negligência ou modificações realizadas pelo locatário deverão ser reparados antes da devolução do imóvel, ressalvado o desgaste natural decorrente do uso regular do imóvel. O Imóvel deverá ser devolvido limpo, nas mesmas condições de higiene em que foi entregue.

Pelo presente, declaram as partes que o imóvel foi devolvido nas condições descritas na lista abaixo, em comparação com o Termo de Vistoria de Entrada, ressalvado o desgaste natural pelo uso.

{{CHECKLIST_VISTORIA_FINAL}}

Eventuais danos identificados em relação ao Termo de Vistoria de Entrada, que não decorram do desgaste natural pelo uso regular, serão de responsabilidade do(a) LOCATÁRIO(A) e/ou da garantia locatícia prestada, podendo ser descontados ou cobrados à parte, conforme previsto no contrato de locação.

Qualquer dúvida ou reclamação ao presente laudo deverá ser comunicada ao LOCADOR por escrito, dentro de 07 dias corridos a contar da data da assinatura deste, destinado ao e-mail {{EMAIL_EMPRESA}}. A falta de comunicação implica em aceitação de vistoria realizada nos termos descritos acima.

E, por assim estarem justos e de acordo, firmam o presente instrumento em duas vias de igual teor e forma.

{{CIDADE_ESTADO_IMOVEL}}, {{DATA_VISTORIA_FINAL}}.


_________________________________
{{NOME_PROPRIETARIO}}
Locador(a)
{{ASSINATURA_CONJUGE_PROPRIETARIO}}
{{BLOCO_ASSINATURA_SOCIO_PROPRIETARIO}}

















_________________________________
{{NOME_EMPRESA}}
Corretora - CRECI {{CRECI}}

















_________________________________
{{NOME_INQUILINO}}
Locatário(a)
{{BLOCO_ASSINATURA_SOCIO_LOCATARIO}}

















{{BLOCO_ASSINATURA_FIADOR}}
{{BLOCO_ASSINATURA_FIADOR2}}
{{ASSINANTES_ADICIONAIS}}

Testemunhas:

{{BLOCO_TESTEMUNHAS}}`;

const TEMPLATE_RESCISAO_PADRAO = `RESCISÃO DO CONTRATO DE LOCAÇÃO
Contrato Nº {{NUMERO_CONTRATO}}

Pelo presente instrumento particular, de um lado:

**LOCADOR: {{NOME_PROPRIETARIO}}**, {{NACIONALIDADE_PROPRIETARIO}}, {{ESTADO_CIVIL_PROPRIETARIO}}, {{PROFISSAO_PROPRIETARIO}}, CPF {{CPF_PROPRIETARIO}}, RG {{RG_PROPRIETARIO}}, Residente na {{ENDERECO_PROPRIETARIO}}{{QUALIFICACAO_REPRESENTANTE_PROPRIETARIO}}, doravante denominado LOCADOR, neste ato representado pela Imobiliária {{NOME_EMPRESA}}, CNPJ {{CNPJ_EMPRESA}}, CRECI {{CRECI}}, com escritório em {{ENDERECO_EMPRESA}}, doravante designada abreviadamente INTERMEDIADORA.

**LOCATÁRIO(A): {{NOME_INQUILINO}}**, estado civil {{ESTADO_CIVIL_INQUILINO}}, {{QUALIFICACAO_PROFISSIONAL_INQUILINO}}, portador(a) do CPF/CNPJ nº {{CPF_INQUILINO}}, RG/IE nº {{RG_INQUILINO}}, telefone {{TELEFONE_INQUILINO}}, email {{EMAIL_INQUILINO}}, residente em {{ENDERECO_INQUILINO}}{{QUALIFICACAO_REPRESENTANTE_INQUILINO}}, doravante denominado(a) LOCATÁRIO(A).

**{{QUALIFICACAO_GARANTIA_VISTORIA_RESCISAO}}**

**IMÓVEL: {{TIPO_IMOVEL}} "{{NOME_IMOVEL}}"**, situado em {{ENDERECO_IMOVEL}}, {{CIDADE_IMOVEL}}/{{ESTADO_IMOVEL}}, CEP {{CEP_IMOVEL}}, mediante as cláusulas e condições seguintes:

Características do imóvel: {{DESCRICAO_IMOVEL}}

**(A vistoria de saída em anexo, assinada pelas partes, faz parte integrante do distrato do contrato de locação, as fotos desta vistoria estão anexadas aos e-mails do locatário, fiador e locador, ##{{EMAILS_PARTES}}##, tendo até 7 dias para alguma contestação caso julgue necessário.)**

CLÁUSULA 1 – MOTIVO
O LOCATÁRIO declara que a rescisão ocorre por motivo de: {{MOTIVO_RESCISAO}}
Em razão desta circunstância, as partes resolvem rescindir o contrato de locação.

CLÁUSULA 2 – DA RESCISÃO
O contrato de locação fica rescindido de pleno direito a partir de {{DATA_RESCISAO}}, data definida pelas partes como marco final da relação locatícia.
Dos valores referentes à Rescisão do Contrato de Locação: {{MULTA_RESCISAO}}. {{OBSERVACOES_RESCISAO}}

CLÁUSULA 3 – DA QUITAÇÃO DE ALUGUÉIS E ENCARGOS
As partes declaram que:
Todos os aluguéis e encargos encontram-se quitados até a data da rescisão.
Com o cumprimento das obrigações acima, o LOCATÁRIO fica responsável pelas faturas até a data da desocupação mesmo que faturadas posteriormente.

CLÁUSULA 4 – DA GARANTIA LOCATÍCIA
Foi prestada garantia na modalidade de: {{GARANTIA_LOCATICIA_LABEL}}
Nada mais restará a reclamar quanto à garantia contratual.

CLÁUSULA 5 – DO ENCERRAMENTO DA ADMINISTRAÇÃO
A partir da data da rescisão:
a) Encerra-se a administração imobiliária deste contrato exercida pela IMOBILIÁRIA;
b) A taxa de administração será devida proporcionalmente até a data acima estipulada;
c) Será apresentada prestação de contas final ao LOCADOR;
d) A IMOBILIÁRIA dá por encerrada sua responsabilidade quanto à gestão do imóvel.

CLÁUSULA 6 – DISPOSIÇÕES FINAIS
O presente instrumento é firmado em caráter irrevogável e irretratável entre as partes e seus sucessores.
E por estarem assim justos e contratados, firmam o presente instrumento em via única em PDF com cópias para as partes, na presença das testemunhas abaixo.

{{CIDADE_ESTADO_IMOVEL}}, {{DATA_HOJE}}.


_________________________________
{{NOME_PROPRIETARIO}}
Locador(a)
{{ASSINATURA_CONJUGE_PROPRIETARIO}}
{{BLOCO_ASSINATURA_SOCIO_PROPRIETARIO}}

















_________________________________
{{NOME_EMPRESA}}
Corretora - CRECI {{CRECI}}

















_________________________________
{{NOME_INQUILINO}}
Locatário(a)
{{BLOCO_ASSINATURA_SOCIO_LOCATARIO}}

















{{BLOCO_ASSINATURA_FIADOR}}
{{BLOCO_ASSINATURA_FIADOR2}}
{{ASSINANTES_ADICIONAIS}}

Testemunhas:

{{BLOCO_TESTEMUNHAS}}`;

const TEMPLATES_PADRAO = {
  LOCACAO_RESIDENCIAL: TEMPLATE_LOCACAO_RESIDENCIAL_PADRAO,
  LOCACAO_COMERCIAL: TEMPLATE_LOCACAO_COMERCIAL_PADRAO,
  INTERMEDIACAO: TEMPLATE_INTERMEDIACAO_PADRAO,
  VISTORIA_INICIAL: TEMPLATE_VISTORIA_INICIAL_PADRAO,
  VISTORIA_FINAL: TEMPLATE_VISTORIA_FINAL_PADRAO,
  RESCISAO: TEMPLATE_RESCISAO_PADRAO,
};

const LABEL_TIPO_DOCUMENTO = {
  LOCACAO_RESIDENCIAL: 'Contrato de Locação Residencial',
  LOCACAO_COMERCIAL: 'Contrato de Locação Comercial',
  INTERMEDIACAO: 'Contrato de Intermediação',
  VISTORIA_INICIAL: 'Termo de Vistoria (Entrada)',
  VISTORIA_FINAL: 'Termo de Vistoria (Saída)',
  RESCISAO: 'Termo de Rescisão',
};

module.exports = {
  montarDadosPlaceholders,
  substituirPlaceholders,
  LISTA_PLACEHOLDERS,
  TEMPLATES_PADRAO,
  LABEL_TIPO_DOCUMENTO,
  ITENS_VISTORIA_PADRAO,
  montarChecklistPadrao,
  interpretarChecklist,
  formatarNumeroContrato,
  montarEnderecoCompleto,
  extrairClausulasDoModelo,
  inserirClausulasAdicionais,
};
