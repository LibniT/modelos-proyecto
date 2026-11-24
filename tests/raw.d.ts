// Vite/Vitest importa archivos de texto con `?raw` (usado para comparar datos con sus fuentes en docs/).
declare module '*?raw' {
  const text: string;
  export default text;
}
