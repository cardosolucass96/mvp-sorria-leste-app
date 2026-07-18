export interface TermoCanonico {
  slug: string;
  titulo: string;
  conteudoHtml: string;
  ativo: number;
  permiteAutentique: number;
}

export const TERMOS_CANONICOS_IMPLANTE: TermoCanonico[] = [
  {
    slug: 'implante',
    titulo: 'Termo de Autorização Implante/Coroa Dentária',
    ativo: 1,
    permiteAutentique: 1,
    conteudoHtml: `<p>TERMO DE AUTORIZAÇÃO IMPLANTE/COROA DENTÁRIA</p>
<p>CLÍNICA SORRIA LESTE</p>
<p>Pelo presente termo de consentimento livre e esclarecido, eu, {{cliente_nome}}, paciente (ou responsável legal, quando aplicável), portador(a) do CPF nº {{cliente_cpf}}, Telefone {{cliente_telefone}}, declaro que li, compreendi e aceito as condições abaixo.</p>
<ul>
  <li>A ficha de anamnese foi preenchida e por mim assinada, apresentando informações que correspondem à verdade dos fatos, especialmente no que diz respeito às minhas condições da saúde geral e bucal, não tendo omitido ou suprimido qualquer dado quanto a doenças preexistentes e que sejam de meu conhecimento, tão pouco quanto ao uso de medicamentos controlados ou não, ciente de que a omissão de dados sobre a minha saúde geral e bucal e sobre o uso de medicamentos pode interferir negativamente no planejamento e andamento de tratamento, na resposta biológica do meu organismo à técnica empregada, podendo ocasionar danos irreversíveis à minha saúde bucal e geral, inclusive quando do uso de substâncias medicamentosas utilizadas durante o procedimento odontológico ou prescritas no transcorrer do tratamento, que podem dar causa à problemas cardíacos, alérgicos e até a morte.</li>
  <li>Considerando minha queixa principal e, após avaliação clínica e de eventuais exames complementares, o(a) profissional me esclareceu sobre o diagnóstico e planejamento de tratamento, com alternativas e informações claras sobre os objetivos e riscos do planejamento terapêutico escolhido, bem como sobre minha responsabilidade de colaborar e contribuir para o tratamento que será executado.</li>
  <li>É de meu conhecimento de que o tratamento proposto será realizado aproximadamente em {{previsao_inicio}}, podendo, todavia, sofrer prorrogação ou alteração de prazo, de acordo com eventual complexidade que o caso apresentar no decorrer do tratamento, bem como pela resposta biológica do meu organismo à técnica empregada, assiduidade às consultas e seguimento das orientações fornecidas pelo(a) profissional.</li>
</ul>
<ul>
  <li><strong><em>Declaro que estou ciente de que deverei comparecer pontualmente ao consultório, nas sessões previamente agendadas, devendo seguir rigorosamente as prescrições, encaminhamentos a outros especialistas da área odontológica ou profissionais da área de saúde e demais orientações fornecidas pelo(a) profissional, sob pena de ser declarado interrompido o tratamento.</em></strong></li>
  <li><strong><em>É de meu conhecimento de que devo informar ao(à) profissional qualquer alteração em decorrência do tratamento realizado, insatisfações ou dúvidas sobre o tratamento em execução, mantendo meus dados cadastrais sempre atualizados e informando eventuais mudanças de endereço, telefone e demais contatos.</em></strong></li>
  <li><strong><em>Fui assegurado(a) de que apenas procedimentos permitidos e cientificamente comprovados serão empregados e aceito que para meu tratamento o(a) cirurgião-dentista escolha o tipo de implante a ser usado. Fui também informado(a) de que pode ser necessário alterar o planejamento inicial durante o procedimento cirúrgico e/ou protético, em função de uma condição óssea desfavorável ou proximidade com as estruturas anatômicas. Além disso, estou ciente dos riscos relacionados a uma exposição acidental do seio maxilar ou injúria acidental ao nervo alveolar inferior, com consequente parestesia, nos casos em que a intervenção cirúrgica ocorra próxima a estas estruturas. Finalmente, todas as minhas perguntas foram claramente respondidas e uma explicação sobre os detalhes do tratamento me foi fornecida.</em></strong></li>
  <li><strong><em>Entendo a importância da saúde bucal e me comprometo a seguir as orientações da equipe odontológica, assim como a retornar às consultas de orientações programadas.</em></strong></li>
  <li><strong><em>Declaro ter sido informado(a) que não existem garantias absolutas de que estes implantes e seus respectivos dentes artificiais irão manter-se estáveis durante toda minha vida e que o sucesso a longo prazo dependerá de uma manutenção regular. Entendo ainda que, em certos casos, uma pequena porcentagem dos implantes poderá ser perdida em decorrência de fatores como má qualidade óssea, infecções pós-operatórias e má higienização. Nestes casos poderá ser colocado um novo implante após o adequado reparo ósseo no local.</em></strong></li>
  <li><strong><em>Havendo qualquer alteração que seja de meu conhecimento quanto à minha saúde bucal ou geral, bem como o surgimento de dores nos elementos dentários ou outras dores orofaciais, é de minha responsabilidade manter contato com o(a) profissional, viabilizando a necessária avaliação do meio bucal e dos fatores que podem ter influenciado ou que tenham sido os causadores de eventuais danos ou alterações que, eventualmente, podem dar origem a prejuízos diversos e até a perda dos implantes e do trabalho protético instalado.</em></strong></li>
  <li><strong><em>Caso ocorra a perda de um ou mais implantes e a reposição dos mesmos seja essencial para a instalação dos dentes artificiais, concordo em arcar com os custos do material empregado, sendo que caberá ao(à) profissional a realização de uma nova cirurgia sem a cobrança de novos honorários. Caberá a mim arcar com os custos do anestesista, caso eu deseje que o procedimento cirúrgico seja realizado sob sedação.</em></strong></li>
  <li><strong><em>Informo que fui esclarecido(a) a respeito dos cuidados pós-tratamento reabilitadores protéticos que devo manter com o intuito de preservar a durabilidade do serviço odontológico realizado na etapa cirúrgica e na etapa protética, sendo que esta última foi realizada com o material acordado, de acordo com o tamanho e cor dos elementos dentários previamente aprovados.</em></strong></li>
  <li><strong><em>Estou ciente de que, assim como o trabalho protético, os elementos dentários naturais podem sofrer alterações, danos e prejuízos por questões naturais, por deficiência na higienização, doenças periodontais ou outras alterações bucais advindas de fatores biológicos ou externos, que não terão como fato causador o tratamento realizado.</em></strong></li>
  <li><strong><em>Estou ciente de que os implantes serão instalados de maneira precisa, observando o que determina a técnica empregada e indicada ao caso, com a devida osseointegração. Ainda, é de meu conhecimento que não há garantia de que os implantes permanecerão imutáveis quanto à sua osseointegração, situação que pode ser agravada pelo hábito de fumar e pela deficiência na higienização.</em></strong></li>
  <li><strong><em>O trabalho protético sobre os implantes será instalado de forma adequada e adaptada, conforme prevê a técnica, a fim de resguardar as questões funcionais da reabilitação oral.</em></strong></li>
  <li><strong><em>Declaro, ainda, que tenho conhecimento de que ao término do tratamento deverei retornar para consultas de acompanhamento de acordo com os critérios estabelecidos pelo(a) profissional, visando resguardar e manter o tratamento realizado, sendo certo que não é possível garantir o tempo de durabilidade dos procedimentos odontológicos, pois referida avaliação deverá observar as condições de minha saúde e eventuais alterações bucais, hábitos em geral, adequada higienização oral, além de outros fatores internos ou externos que podem danificar o serviço prestado. O profissional não se eximirá de avaliar eventual dano ou prejuízo sofrido e alegado, reparando-o, quando o caso, dentro do limite de sua responsabilidade.</em></strong></li>
  <li><strong><em>Estou ciente que fica estipulado o prazo de 90 (noventa) dias, a partir da finalização do tratamento, conforme disposto no art. 26, inciso II, do Código de Defesa do Consumidor, para comunicação de eventual alteração do trabalho realizado e entregue em perfeitas condições, de forma que após esse prazo qualquer medida dependerá da avaliação clínica profissional.</em></strong></li>
  <li>Além disso fui esclarecido(a) do motivo da necessidade de informar meu CPF e Telefone, conforme a LGPD, e que todos meus dados ficarão em total sigilo, não sendo compartilhados em hipótese alguma. Dessa forma declaro que consenti em informar tais dados.</li>
</ul>
<p>Implantes (dentes): {{implante_elementos_dentes}}</p>
<p>Coroas sobre implantes: {{implante_coroas}}</p>
<p>Protocolo sobre implante: {{implante_protocolo}}</p>
<p>_________________, ____ de ______________ de __________</p>
<p>(Assinatura e CPF do(a) paciente/responsável)</p>
<p>__________________________________________</p>
<p>(Assinatura do profissional)</p>`,
  },
  {
    slug: 'referencia-implante',
    titulo: 'Referência implante',
    ativo: 1,
    permiteAutentique: 0,
    conteudoHtml: `<p>REFERÊNCIA IMPLANTE</p>
<p>CLÍNICA SORRIA LESTE</p>
<p>Nome do paciente: _________________________________________</p>
<p>Dentista responsável: ________________________________</p>
<table style="margin-top: 6mm; border-collapse: collapse; width: 100%; font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt;">
  <thead>
    <tr>
      <th style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; width: 16%;">DATA</th>
      <th style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; width: 22%;">REFERÊNCIA</th>
      <th style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; width: 18%;">REGIÃO</th>
      <th style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; width: 22%;">DENTISTA</th>
      <th style="border: 1px solid #94a3b8; padding: 8px 10px; text-align: center; width: 22%;">PACIENTE</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px; height: 18mm;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px; height: 18mm;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px; height: 18mm;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
    </tr>
    <tr>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px; height: 18mm;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
      <td style="border: 1px solid #94a3b8; padding: 11px 10px;">&nbsp;</td>
    </tr>
  </tbody>
</table>`,
  },
];
