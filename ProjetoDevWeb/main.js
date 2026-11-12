const formulario = document.getElementById("formPoke")

formulario.addEventListener("submit", async function(evento){
    evento.preventDefault(); //Evitar que a page recarregue

    const id = document.getElementById("idPoke").value

    const resposta = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)

    const pokemon = await resposta.json()

    document.getElementById("nomePokemon").textContent = pokemon.name;

    document.getElementById("imgPoke").src = pokemon.sprites.front_default;

    document.getElementById("basePoke").textContent = pokemon.base_experience;

    document.getElementById("alturaPoke").textContent = pokemon.height;

    document.getElementById("pesoPoke").textContent = pokemon.weight;

    // location_area_encounters é uma URL: precisa de uma segunda requisição
    const respostaLoc = await fetch(`https://pokeapi.co/api/v2/pokemon/132/encounters`)

    const locais = await respostaLoc.json()

    const nomes = locais
        .slice(0, 3) // mostra no máximo 3 locais
        .map(l => l.location_area.name.replace(/-/g, " "))

    document.getElementById("locPoke").textContent =
        nomes.length ? nomes.join(", ") : "Desconhecido";
})
