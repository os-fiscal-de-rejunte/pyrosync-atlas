---
name: PyroSync Atlas
description: Explorador de observações terrestres com globo tridimensional e painéis de dados.
colors:
  ink: "#172d27"
  forest: "#285f47"
  space: "#050b0c"
  surface: "#ffffff"
  mint: "#d2ecb7"
  fire: "#eb875a"
typography:
  display:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "clamp(43px, 5.8vw, 78px)"
    fontWeight: 730
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  body:
    fontFamily: "DM Sans Variable, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "8px"
  panel: "14px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  button-welcome:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "15px 19px"
---

# Design System: PyroSync Atlas

## Overview

**Creative North Star: "Observatório orbital"**

O globo é a superfície principal. Barras compactas e painéis removíveis deixam o território visível e mantêm as tarefas científicas acessíveis em linguagem simples.

## Colors

O espaço escuro destaca imagens terrestres; superfícies brancas e verdes acolhem controles e resultados. Tons quentes identificam observações e estimativas, acompanhados de uma legenda explícita.

## Typography

Manrope apresenta títulos e marcas; DM Sans organiza controles, dados e textos de apoio. Valores numéricos usam espaçamento tabular onde disponível.

## Layout

No computador, ferramentas ficam nas bordas e o painel abre à direita. Em telas estreitas, a navegação recolhe e o painel abre sobre a parte inferior do globo.

## Elevation & Depth

Sombras suaves separam menus e painéis da imagem; a Terra permanece uma cena tridimensional interativa.

## Shapes

Controles usam cantos discretamente arredondados; painéis usam raios um pouco maiores.

## Components

Busca geográfica, seletor de camadas, listas por célula, avisos científicos e botões de ação usam contraste e estados de foco visíveis.

## Do's and Don'ts

### Do:
- **Do** preservar legenda, fonte e condição junto aos valores.
- **Do** manter o globo navegável e os painéis fecháveis.

### Don't:
- **Don't** apresentar uma imagem base estática como observação ao vivo.
- **Don't** apresentar estimativas experimentais como alertas operacionais.
