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
