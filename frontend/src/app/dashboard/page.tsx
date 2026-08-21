'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

function formatarMoeda(valor: number) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const CORES_STATUS: Record<string, string> = {
  PAGO: '#046439',
  PENDENTE: '#C9962C',
  ATRASADO: '#A8492E',
};

const LABEL_STATUS: Record<string, string> = {
  PAGO: 'Pago',
  PENDENTE: 'Pendente',
  ATRASADO: 'Atrasado',
};

const CORES_TIPO = ['#046439', '#2E8058', '#C9962C', '#A8492E', '#6E6B5E'];

export default function DashboardPage() {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api
      .get('/api/dashboard')
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, []);

  return (
    <AppShell>
      <h1 className="font-display font-semibold text-2xl text-savanna-green-700 mb-1">Painel</h1>
      <p className="text-savanna-muted text-sm mb-6">Resumo geral da operação</p>

      {erro && <p className="text-savanna-rust text-sm">{erro}</p>}

      {dados && (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card">
              <p className="label">Total de imóveis</p>
              <p className="text-2xl font-semibold">{dados.resumo.totalImoveis}</p>
            </div>
            <div className="card">
              <p className="label">Taxa de ocupação</p>
              <p className="text-2xl font-semibold">{dados.resumo.taxaOcupacao}%</p>
              <p className="text-xs text-savanna-muted mt-1">
                {dados.resumo.imoveisAlugados} alugados · {dados.resumo.imoveisDisponiveis} disponíveis
              </p>
            </div>
            <div className="card">
              <p className="label">Recebido no mês</p>
              <p className="text-2xl font-semibold">{formatarMoeda(dados.resumo.recebidoNoMes)}</p>
            </div>
            <div className="card">
              <p className="label">Em aberto (atrasado + próx. 7 dias)</p>
              <p className="text-2xl font-semibold text-savanna-rust">
                {formatarMoeda(dados.resumo.valorTotalEmAberto)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="card">
              <p className="label">Pagamentos atrasados</p>
              <p className="text-2xl font-semibold text-savanna-rust">
                {dados.resumo.totalPagamentosAtrasados}
              </p>
            </div>
            <div className="card">
              <p className="label">Valor mensal da carteira alugada</p>
              <p className="text-2xl font-semibold">{formatarMoeda(dados.resumo.valorTotalCarteiraAluguel)}</p>
            </div>
            <div className="card">
              <p className="label">Quantidade de inquilinos</p>
              <p className="text-2xl font-semibold">{dados.resumo.totalInquilinos}</p>
            </div>
            <div className="card">
              <p className="label">Quantidade de proprietários</p>
              <p className="text-2xl font-semibold">{dados.resumo.totalProprietarios}</p>
            </div>
          </div>

          {/* Gráficos */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="card">
              <h2 className="font-medium mb-4">Recebimentos - últimos 6 meses</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dados.graficos.recebimentosPorMes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E1D3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} stroke="#6E6B5E" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#6E6B5E" width={70}
                    tickFormatter={(v) => `R$${Math.round(v / 100) / 10}k`} />
                  <Tooltip formatter={(v: number) => formatarMoeda(v)} />
                  <Bar dataKey="total" fill="#046439" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h2 className="font-medium mb-4">Status dos pagamentos</h2>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={dados.graficos.statusPagamentos.filter((s: any) => s.quantidade > 0)}
                    dataKey="quantidade"
                    nameKey="status"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {dados.graficos.statusPagamentos.map((s: any) => (
                      <Cell key={s.status} fill={CORES_STATUS[s.status]} />
                    ))}
                  </Pie>
                  <Legend formatter={(value: string) => LABEL_STATUS[value] || value} />
                  <Tooltip
                    formatter={(v: number, _n: string, item: any) => [`${v} pagamento(s)`, LABEL_STATUS[item.payload.status]]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="card">
              <h2 className="font-medium mb-4">Imóveis por tipo</h2>
              {dados.imoveis.porTipo.length === 0 ? (
                <p className="text-sm text-savanna-muted">Nenhum imóvel cadastrado.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dados.imoveis.porTipo} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E1D3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} stroke="#6E6B5E" allowDecimals={false} />
                    <YAxis type="category" dataKey="tipo" tick={{ fontSize: 12 }} stroke="#6E6B5E" width={90}
                      tickFormatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)} />
                    <Tooltip />
                    <Bar dataKey="quantidade" radius={[0, 4, 4, 0]}>
                      {dados.imoveis.porTipo.map((_: any, idx: number) => (
                        <Cell key={idx} fill={CORES_TIPO[idx % CORES_TIPO.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <h2 className="font-medium mb-4">Inadimplentes (maior valor em aberto)</h2>
              {dados.alertas.inadimplentes.length === 0 ? (
                <p className="text-sm text-savanna-muted">Nenhum inquilino inadimplente. 🎉</p>
              ) : (
                <ul className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {dados.alertas.inadimplentes.map((i: any) => (
                    <li key={i.inquilinoId} className="text-sm flex justify-between items-center border-b border-savanna-border pb-2">
                      <div>
                        <p>{i.nome}</p>
                        <p className="text-xs text-savanna-muted">{i.quantidade} parcela(s) em atraso</p>
                      </div>
                      <span className="text-savanna-rust font-medium">{formatarMoeda(i.totalEmAberto)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="font-medium mb-3">Pagamentos atrasados</h2>
              {dados.alertas.pagamentosAtrasados.length === 0 && (
                <p className="text-sm text-savanna-muted">Nenhum pagamento em atraso.</p>
              )}
              <ul className="space-y-2">
                {dados.alertas.pagamentosAtrasados.map((p: any) => (
                  <li key={p.id} className="text-sm flex justify-between border-b border-savanna-border pb-2">
                    <span>{p.inquilino.nome}</span>
                    <span className="text-savanna-rust">{formatarMoeda(p.valor)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h2 className="font-medium mb-3">Vencendo nos próximos 7 dias</h2>
              {dados.alertas.vencendoEm7Dias.length === 0 && (
                <p className="text-sm text-savanna-muted">Nada vencendo nos próximos dias.</p>
              )}
              <ul className="space-y-2">
                {dados.alertas.vencendoEm7Dias.map((p: any) => (
                  <li key={p.id} className="text-sm flex justify-between border-b border-savanna-border pb-2">
                    <span>{p.inquilino.nome}</span>
                    <span>{formatarMoeda(p.valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
