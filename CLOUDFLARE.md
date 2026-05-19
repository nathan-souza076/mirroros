# Publicar no Cloudflare Pages + R2

Este modo deixa o MirrorOS como site estatico no Cloudflare Pages. Os videos/imagens ficam no Cloudflare R2.

## 1. Criar o bucket R2

No painel da Cloudflare:

1. Va em `R2 Object Storage`.
2. Crie um bucket, por exemplo `mirroros-media`.
3. Envie seus arquivos de video/imagem para o bucket.
4. Configure acesso publico ao bucket ou conecte um dominio publico para leitura.

Guarde a URL publica dos arquivos. Ela sera usada como `MEDIA_BASE_URL`.

Exemplo:

```text
https://media.seudominio.com
```

## 2. Gerar o manifest

Coloque uma copia dos nomes dos arquivos na pasta local `media` e rode:

```powershell
$env:MEDIA_BASE_URL = "https://media.seudominio.com"
npm run build
```

Isso cria:

```text
public/manifest.json
```

O site usa esse arquivo para saber quais midias mostrar.

## 3. Publicar no Cloudflare Pages

No Cloudflare Pages:

```text
Build command: npm run build
Build output directory: public
```

Se o projeto estiver no GitHub, a Cloudflare roda o build sozinha a cada push.

## 4. Atualizar videos depois

1. Suba o novo arquivo no R2.
2. Coloque o mesmo arquivo na pasta local `media` ou mantenha uma copia local com o mesmo caminho.
3. Rode `npm run build`.
4. Publique novamente no Pages.

## Observacoes

- Para TVs, prefira `.mp4` com codec H.264.
- Arquivos grandes devem ficar no R2, nao dentro do Cloudflare Pages.
- O link final da TV sera algo como `https://mirroros.pages.dev`.
