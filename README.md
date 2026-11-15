# PyroSync Atlas

Aplicação web em React e TypeScript para explorar a Terra em um globo tridimensional, consultar o calendário de detecções, visualizar amostras de focos, experimentar cenários climáticos e examinar análises em linguagem simples. O backend da interface usa FastAPI como intermediário para a API PyroSync e mantém as credenciais no servidor.

## Executar no Windows

No PowerShell, dentro desta pasta:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm install
npm run build
.\.venv\Scripts\python.exe -m uvicorn server.app:app --host 127.0.0.1 --port 8787
```

Abra `http://127.0.0.1:8787`. Depois da instalação e compilação, `iniciar.ps1` inicia o servidor local. Node.js e Python são necessários para instalar o projeto. A API publicada pode levar algum tempo para despertar no plano gratuito.

O programa lê `DATABASE_URL`, `GROQ_API_KEY` e `GEMINI_API_KEY` de variáveis de ambiente. No Windows também pode usar um cofre local cifrado com DPAPI, ligado à conta atual. Execute `.\.venv\Scripts\python.exe -m server.secrets_store` e informe as credenciais em entrada oculta. O cofre fica em `%LOCALAPPDATA%\PyroSync`, fora do repositório. Em outro sistema, use variáveis de ambiente no servidor; nunca use prefixo `VITE_` para segredos.

Para preparar o banco de relatos, com permissão apropriada, execute:

```powershell
.\.venv\Scripts\python.exe -c "from server.secrets_store import load_credentials; load_credentials(); from server.db import create_schema; create_schema()"
```

Os relatos são gravados em `public.pyro_community_reports`, separados dos dados científicos. Eles começam pendentes; para revisar localmente use `python -m scripts.revisar_relatos listar` e depois `python -m scripts.revisar_relatos aprovar ID` ou `rejeitar ID`. Um relato aprovado continua sendo observação humana, não detecção de satélite confirmada.

## Componentes

- `src/`: interface React, globo CesiumJS, camadas e controles.
- `server/`: gateway limitado à API conhecida, cenários e relatos moderados.
- `pyrosync_science/`: cópia versionada do pacote do repositório [pyrosync-science-agents](https://github.com/os-fiscal-de-rejunte/pyrosync-science-agents); o commit de origem está em `ORCHESTRATOR_COMMIT`.
- `public/countries.geojson`: geometria derivada do Natural Earth, com limites cartográficos aproximados.

## Leitura correta dos dados

O calendário e a camada opcional FIRMS direta consultam a NASA sem harmonização. A camada FIRMS direta exibe uma amostra limitada, que pode estar truncada. O controle **Histórico no mapa** mostra os registros mensais disponibilizados pelo mapa WMS-Time do FIRMS no mundo inteiro ou dentro do limite geográfico do país selecionado. A cobertura depende da disponibilidade de cada sensor; pontos próximos podem se sobrepor. A camada harmonizada usa as regiões e datas carregadas no banco. MODIS e VIIRS têm sensibilidades distintas; a ausência de detecções não demonstra ausência de fogo. A imagem de fundo NASA Blue Marble é uma referência estática, não uma imagem ao vivo; as observações têm seus próprios períodos e fontes.

O monitoramento consulta produtos MODIS e VIIRS quase em tempo real do FIRMS para o mundo inteiro a cada cinco minutos enquanto a página está aberta. A primeira consulta cria uma referência; registros disponibilizados nas consultas seguintes aparecem em vermelho por 10 segundos. O servidor compara todos os identificadores recebidos e sinaliza se o limite de 300 mil novidades por consulta for excedido. As consultas são compartilhadas em cache por cinco minutos. Se o serviço reiniciar, as fontes disponíveis mudarem ou a referência sair do cache, ela é criada novamente e observações durante o intervalo podem não ser notificadas. O FIRMS tem atraso de disponibilização e um ponto térmico não confirma um incêndio.

O modelo não foi retreinado. Ele foi treinado em parte do MATOPIBA, e a extensão global e os cenários são experimentais, não calibrados globalmente e inadequados para alertas. A saída é condicional à classificação integral da máscara futura por célula, não uma chance para o país inteiro. O sandbox não simula propagação de incêndio.

Os agentes apresentam histórico e fontes, mas não provam causalidade nem geram uma anomalia validada sem base comparável e cobertura adequada. Sínteses de linguagem podem errar e devem ser conferidas nas evidências. O harmonizador da prévia gratuita no Render não opera continuamente.

## Verificações

```powershell
npm run build
.\.venv\Scripts\python.exe -m pytest tests -q
```

O serviço gratuito pode adormecer. A publicação usa HTTPS, não exige login de visitantes, e mantém os tokens somente no servidor. Limites de uso em memória e revisão manual são adequados à demonstração; implantação para grande público exige controles adicionais, monitoramento e limites de gastos nos provedores.
