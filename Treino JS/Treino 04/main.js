
const listaProdutos = document.getElementById("listaProdutos");
const adicionar = document.getElementById("adicionar");
const calcular = document.getElementById("calcular");

// Formata valores em reais
function formatarMoeda(valor) {
    return valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

// Adiciona um novo produto à tabela
adicionar.addEventListener("click", function () {
    const linha = document.createElement("tr");

    linha.innerHTML = `
        <td><input class="nome" value="Novo item"></td>
        <td><input class="quantidade" type="number"
            min="0" step="1" value="1"></td>
        <td><input class="preco" type="number"
            min="0" step="0.01" value="0"></td>
        <td class="totalProduto">R$ 0,00</td>
        <td><button class="remover" type="button">✖</button></td>
    `;

    listaProdutos.appendChild(linha);
});

// Remove um produto da tabela
listaProdutos.addEventListener("click", function (evento) {
    if (evento.target.classList.contains("remover")) {
        evento.target.closest("tr").remove();
        calcularPedido();
    }
});

// Calcula os valores do pedido
function calcularPedido() {
    const linhas = listaProdutos.querySelectorAll("tr");

    let total = 0;

    linhas.forEach(function (linha) {
        const quantidade = Number(
            linha.querySelector(".quantidade").value
        );

        const preco = Number(
            linha.querySelector(".preco").value
        );

        const totalProduto = quantidade * preco;

        linha.querySelector(".totalProduto").textContent =
            formatarMoeda(totalProduto);

        total += totalProduto;
    });

    // Calcula o desconto conforme o valor da compra
    let percentual = 0;

    if (total < 100) {
        percentual = 0;
    } else if (total < 500) {
        percentual = 5;
    } else {
        percentual = 10;
    }

    const desconto = total * (percentual / 100);
    const totalFinal = total - desconto;

    // Atualiza o resumo do pedido
    document.getElementById("semDesc").textContent =
        formatarMoeda(total);

    document.getElementById("valorDesconto").textContent =
        `${formatarMoeda(desconto)} (${percentual}%)`;

    document.getElementById("comDesc").textContent =
        formatarMoeda(totalFinal);

    document.getElementById("percentual").textContent =
        `${percentual}%`;
}

// Recalcula quando os valores dos produtos mudam
listaProdutos.addEventListener("input", function (evento) {
    if (
        evento.target.classList.contains("quantidade") ||
        evento.target.classList.contains("preco")
    ) {
        calcularPedido();
    }
});

// Botão de calcular pedido
calcular.addEventListener("click", calcularPedido);

// Calcula os valores iniciais ao abrir a página
calcularPedido();