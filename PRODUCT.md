# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, TypeScript, JavaScript e HTML, conforme solicitado. O mapa usa uma biblioteca de globo interativo e o servidor mantém as credenciais fora do navegador.

## Users

Público geral e jurados explorando uma demonstração do desafio NASA Space Apps; pesquisadores e gestores ambientais precisam acessar fontes e limitações. O usuário confirmou essa prioridade.

## Product Purpose

Explorar focos de calor de MODIS e VIIRS, navegar pelo tempo e pelo território, comparar observações e acessar saídas experimentais do modelo existente. A experiência inclui contribuições de testemunhas separadas dos dados de satélite e uma análise científica fundamentada nas fontes disponíveis.

## Operating Context

O calendário global da API publicada consulta FIRMS diretamente e não é harmonizado. As camadas do banco harmonizado cobrem apenas as áreas carregadas. O modelo foi treinado no MATOPIBA; sua aplicação global é experimental e não calibrada. Ausência de detecções não comprova ausência de incêndio nem cobertura observacional completa.

## Capabilities and Constraints

- Globo manipulável, seleção de país e região, zoom e camadas geográficas.
- Calendário temporal, comparação por sensor e transparência de proveniência.
- Previsão por célula, com paginação e limitações do modelo.
- Relatos voluntários identificados como não verificados, sem login obrigatório.
- Análises e curiosidades baseadas em fontes rastreáveis, sem fabricar anomalias ou causas.
- Sem reutilizar credenciais no cliente ou no histórico Git; nenhum serviço pago sem autorização.
- Preservar os arquivos originais em DATA e o modelo treinado.

## Brand Commitments

Nome PYRO / PyroSync. Referência de interação: Google Earth. A interface deve ser clean e tecnológica.

## Evidence on Hand

API publicada em https://pyrosync-api.onrender.com, documentação científica do harmonizador e do modelo, limites Natural Earth e o enunciado fornecido pelo usuário. Não há evidência de validação ou calibração global aprovada para o preditivo.

## Product Principles

1. Preservar a diferença entre observação, harmonização, estimativa e relato humano.
2. Mostrar origem, intervalo e limites junto aos resultados.
3. Acessar a experiência sem exigir conta.
4. Tratar ausência e falhas de fonte como informação incompleta.
