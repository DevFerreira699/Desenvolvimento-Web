/*Tipos de variáveis
var -> escopo global
let -> escopo local
const -> escopo flex, valor será o mesmo até o fim do programa ex: Uma senha*/


/*criando variaveis*/
var valorUm = 5
var valorDois = 11


/*criando uma função*/
function somar(a,b){
    let c = (a+b)
    return (c)
}

console.log(somar(valorUm, valorDois))

