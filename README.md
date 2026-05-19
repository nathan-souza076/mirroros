# MirrorOS Loop Player

Web app para exibir videos e imagens em loop em uma TV.

Ele pode rodar de dois jeitos:

- **GitHub Pages:** gratis sem cartao, bom para poucos videos.
- **Cloudflare Pages + R2:** recomendado para ficar online sem notebook/servidor local.
- **Servidor local:** util para rede interna ou teste.

## GitHub Pages gratis sem cartao

Use o guia [GITHUB_PAGES.md](GITHUB_PAGES.md).

Resumo:

```powershell
npm run build:github
```

Depois envie o projeto para um repositorio publico no GitHub e ative Pages usando a pasta `docs`.

## Cloudflare gratis

Para publicar como site, use o guia [CLOUDFLARE.md](CLOUDFLARE.md).

Resumo:

```powershell
$env:MEDIA_BASE_URL = "https://media.seudominio.com"
npm run build
```

Depois publique a pasta `public` no Cloudflare Pages.

## Como usar localmente

1. Instale Node.js 18 ou superior no computador/servidor que vai hospedar o app.
2. Coloque os arquivos de midia na pasta `media`.
3. Gere o manifest e rode:

```powershell
npm run build
npm start
```

4. Acesse pela TV:

```text
http://IP-DO-SERVIDOR:8080
```

## Servidor da rede

Pode ficar em:

```text
\\192.168.11.10\arquivos\TI\Nathan\MirrorOS
```

Mas a TV precisa acessar por HTTP, nao pelo caminho `\\192.168...`. Por isso, alem dos arquivos nessa pasta, o servidor precisa manter o `server.js` rodando.

Para copiar o app para o servidor:

```powershell
.\scripts\deploy-to-server.ps1
```

No servidor, para iniciar manualmente:

```powershell
.\scripts\start.ps1
```

Para iniciar automaticamente quando o servidor ligar, execute o PowerShell como administrador no servidor:

```powershell
.\scripts\install-startup-task.ps1 -Port 8080
```

Se a TV nao abrir o endereco, libere a porta no Firewall do Windows, tambem como administrador:

```powershell
.\scripts\open-firewall.ps1 -Port 8080
```

Depois disso, o endereco para a TV fica:

```text
http://IP-DO-SERVIDOR:8080
```

## Formatos

Videos: `mp4`, `webm`, `ogg`, `ogv`, `mov`, `m4v`, `mkv`.

Imagens: `jpg`, `jpeg`, `png`, `gif`, `webp`, `avif`, `bmp`.

Para TVs, `mp4` com codec H.264 costuma ser a opcao mais compativel.
