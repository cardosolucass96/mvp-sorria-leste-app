export function finalizarJanelaDeImpressao(janela: Window) {
  let disparou = false;

  const imprimir = () => {
    if (disparou) return;
    disparou = true;
    janela.focus();
    janela.print();
  };

  janela.addEventListener(
    'load',
    () => {
      janela.setTimeout(imprimir, 120);
    },
    { once: true }
  );

  janela.document.close();

  if (janela.document.readyState === 'complete') {
    janela.setTimeout(imprimir, 120);
  }
}
