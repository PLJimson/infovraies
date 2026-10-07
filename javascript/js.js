//js showing date now
const dateElement = document.getElementById("current-date");

const now = new Date();

const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
const formattedDate = now.toLocaleDateString('fr-FR', options);

dateElement.textContent = "📅 Aujourd'hui : " + formattedDate;
