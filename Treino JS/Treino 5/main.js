const listas = document.getElementById("lista")
const alunos = ["Afonso", "Ferreira", "Kim","Lucas"]

for (const aluno of alunos){
    const p = document.createElement("p")
    p.textContent = aluno
    listas.appendChild(p)
}
 
