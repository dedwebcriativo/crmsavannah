const VERSAO_SISTEMA = '1.0.0';

export default function Footer() {
  const ano = new Date().getFullYear();

  return (
    <footer className="text-center text-xs text-savanna-muted py-4 px-4">
      © {ano} Savannah Imóveis · 47.722.352/0001-14. CRM desenvolvido por{' '}
      <a
        href="https://dedweb.com.br"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-savanna-green-700"
      >
        DEDWEB CRIATIVO
      </a>
      . Versão {VERSAO_SISTEMA}
    </footer>
  );
}
