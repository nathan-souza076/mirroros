# Publicar no GitHub Pages

Este modo nao precisa de cartao.

## 1. Gerar arquivos estaticos

Na pasta do projeto:

```powershell
npm run build:github
```

Isso copia os arquivos de `media`, gera `public/manifest.json` e prepara a pasta `docs` para o GitHub Pages.

## 2. Criar repositorio no GitHub

1. Entre em <https://github.com/new>.
2. Nome sugerido: `mirroros`.
3. Deixe como `Public`.
4. Crie sem marcar README, gitignore ou license.

## 3. Enviar o projeto

Depois de criar o repositorio, rode na pasta do projeto:

```powershell
git init
git add .
git commit -m "Initial MirrorOS player"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/mirroros.git
git push -u origin main
```

Troque `SEU-USUARIO` pelo seu usuario do GitHub.

## 4. Ativar o GitHub Pages

No repositorio:

1. Va em `Settings`.
2. Clique em `Pages`.
3. Em `Build and deployment`, selecione `Deploy from a branch`.
4. Em `Branch`, selecione:

```text
main / docs
```

5. Salve.

O link final sera parecido com:

```text
https://SEU-USUARIO.github.io/mirroros/
```

## Editar playlists pelo proprio GitHub Pages

O GitHub Pages e estatico, entao para salvar playlists globais direto pelo link publico o app grava no repositorio usando a API do GitHub.

Na primeira vez que salvar uma playlist pelo app, cole uma chave do GitHub com permissao de escrita em `Contents` para este repositorio. A chave fica salva apenas no navegador daquele aparelho/editor.

Resumo do fluxo:

1. Abra `https://SEU-USUARIO.github.io/mirroros/`.
2. Clique em `Playlists`.
3. Crie ou edite a playlist.
4. Ao salvar, informe a chave do GitHub se o app pedir.

Depois que o app salva, todos que abrirem o mesmo link passam a ler a playlist atualizada do repositorio.
