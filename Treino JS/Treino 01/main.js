const formulario = document.getElementById("calcForm")

formulario.addEventListener("submit", function(e){ e.preventDefault();
    
    const a = Number(document.getElementById("num1").value)
    const b = Number(document.getElementById("num2").value)

    const soma = a+b

    document.getElementById("resultado").textContent = soma

})