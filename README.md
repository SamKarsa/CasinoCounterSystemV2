# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Máquinas Poker: Physical Coin y Yield

Las máquinas cuyo tipo se llama exactamente `Poker` **no tienen contadores
IN/OUT**. Tienen dos contadores **independientes**, que nunca se restan entre sí:

- **Physical Coin** — los premios que pagó la máquina.
- **Yield** — la ganancia.

**Convención de digitación:** *Physical se carga en el campo IN* y *Yield en el
campo OUT*. La base de datos sigue guardando `counterIn` / `counterOut`; lo que
cambia es qué significa cada uno. En la pantalla de la máquina, cuando el tipo es
Poker, las columnas y los campos se rotulan PHYSICAL / YIELD en vez de IN / OUT.

Por eso en Poker las dos fórmulas quedan invertidas respecto de una máquina
normal:

| | IN-OUT | Premios |
| --- | --- | --- |
| Normal | `(Δin - Δout) × valor de moneda` | `(Δout) × valor de moneda` |
| Poker | `(Δout) × valor de moneda` (yield) | `(Δin) × valor de moneda` (physical) |

El faltante/sobrante no cambia: `faltaSobra = totalEntregado - IN-OUT` en ambos
casos. La detección es por `nameTypeMachine = 'Poker'`: **no renombrar esa fila
del seed**.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
