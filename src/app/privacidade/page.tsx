export const metadata = { title: "Privacidade" };
export default function Privacy() {
  return (
    <div className="page-content privacy-copy">
      <div className="page-heading">
        <span className="eyebrow">CUIDADO TAMBÉM COM SEUS DADOS</span>
        <h1>Privacidade.</h1>
      </div>
      <p>
        Usamos nome, e-mail, endereços e informações dos pedidos para manter sua
        conta, processar compras e entregas e prevenir fraudes. Senhas são
        armazenadas como hashes; não armazenamos números de cartão nem códigos
        de segurança.
      </p>
      <h2>Cookies necessários</h2>
      <p>
        Esta aplicação usa cookies de sessão e de sacola para manter seu acesso
        e os produtos selecionados. São cookies essenciais ao funcionamento da
        loja. Não há rastreadores de publicidade instalados nesta versão.
      </p>
      <h2>Serviços envolvidos</h2>
      <p>
        O pagamento, quando habilitado, ocorre no provedor de pagamentos. O
        envio de e-mails e a entrega utilizam os serviços configurados pela
        operação da loja. Imagens e fontes podem ser carregadas de serviços
        externos, que recebem os dados técnicos necessários à conexão.
      </p>
      <h2>Seus dados</h2>
      <p>
        Você pode consultar seus pedidos e atualizar seu nome e endereços na
        área da conta. Dados de pedidos e auditoria têm acesso restrito.
      </p>
      <div className="info-banner">
        Informações da operação em preparação: a identificação do responsável
        pela loja, o canal para solicitações sobre dados pessoais e os prazos de
        retenção devem ser preenchidos pela empresa antes de abrir vendas ao
        público.
      </div>
    </div>
  );
}
