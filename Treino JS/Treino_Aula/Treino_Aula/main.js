const dadosThiago = [
    { produto: "Pá", categoria: "Manual", quantidade: 15, preco: 45 },

    { produto: "Tesoura de poda", categoria: "Poda", quantidade: 12, preco: 65 },

    { produto: "Mangueira", categoria: "Irrigação", quantidade: 10, preco: 110 },

    { produto: "Cortador de grama", categoria: "Elétrico", quantidade: 4, preco: 950 }
];

const configTable = document.getElementById("configTable")

    for (let dado of dadosThiago){
        const linha = document.createElement('tr')

        linha.innerHTML = `
            <td>${dado.produto}</td>
            <td>${dado.categoria}</td>
            <td>${dado.quantidade}</td>
            <td class="preco">${dado.preco.toLocaleString("pt-BR",{
            style: "currency",
            currency: "BRL"
            })}</td>
        `

    configTable.appendChild(linha)
}


