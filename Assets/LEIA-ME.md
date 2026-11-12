# Assets do Rabiola

Modelos 3D e imagens do jogo, exportados do mesmo código que o jogo usa para desenhar tudo.

## Pastas

| pasta | o que tem |
|---|---|
| `personagens/` | os 6 estilos prontos do menu + o figurante com vara de bambu |
| `pipas/` | todas as pipas em todas as estampas, com rabiola (laços ou fitas) e cabresto |
| `objetos/` | carretéis (lata, papelão, carretilha), vara de bambu, bola, trave, poste, argola |
| `cenario/` | árvores (mangueira, eucalipto, jamelão), casas (reboco 1 e 2 andares, tijolo), nuvem, tufo de capim, morro |
| `texturas/` | PNGs: estampas das pipas, camisas, reboco, tijolo, grama, bola e o balão de "bravo" |

`lista-de-arquivos.md` lista cada arquivo com o tamanho.

## Formato

- **.glb** (glTF 2.0 binário): abre no Blender (Arquivo → Importar → glTF), no Visualizador 3D do Windows,
  em https://gltf-viewer.donmccurdy.com, Unity, Godot, Unreal etc. As texturas vão dentro do próprio arquivo.
- Escala em **metros**, eixo **Y para cima**; o personagem fica de frente para **+Z**, com os pés em Y = 0.
- As pipas usam recorte por transparência (*alpha mask*) e dupla face; o capim e as árvores usam cores por vértice.
- A sombra redonda falsa embaixo dos bonecos e os efeitos que só existem durante a partida não entram nos arquivos.

## Refazer a pasta

Com o servidor rodando (`iniciar-servidor.bat`), abra `http://localhost:8080/ferramentas/exportar-assets.html`
e clique em **Exportar tudo**. Os arquivos são substituídos pelos novos.
