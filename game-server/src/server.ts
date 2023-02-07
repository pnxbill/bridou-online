import app from './app'
import fs from 'fs'
// Define the custom log function
function log(...args: any[]) {
  console.log(...args)

  // Append a new line with all the arguments to the `game.txt` file
  fs.appendFileSync('game.txt', args.join(' ') + '\n')

  return (receiver: string) => {
    app.io.to(receiver).emit('log', [...args].join(' '))
  }
}

// Add the custom log function to the global object
global.log = log

const PORT = 3001
app.server.listen(PORT)
console.log(`Server listening on port: ${PORT}`)
