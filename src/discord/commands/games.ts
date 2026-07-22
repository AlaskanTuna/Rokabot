/** Slash command definitions for game features */

import { SlashCommandBuilder } from 'discord.js'

export const gachaCommand = new SlashCommandBuilder()
  .setName('gacha')
  .setDescription('Meet your VN companion spirit~')
  .addSubcommand((sub) => sub.setName('hatch').setDescription('Hatch your companion spirit for the first time!'))
  .addSubcommand((sub) => sub.setName('view').setDescription('View your companion spirit'))
  .addSubcommand((sub) => sub.setName('pet').setDescription('Interact with your companion~'))
  .addSubcommand((sub) => sub.setName('stats').setDescription("View your companion's detailed stats"))
  .addSubcommand((sub) => sub.setName('collection').setDescription('Browse your full companion collection'))
  .addSubcommand((sub) => sub.setName('guide').setDescription('Learn about the companion system'))
  .addSubcommand((sub) => sub.setName('leaderboard').setDescription('View top companions by stats'))

export const hangmanCommand = new SlashCommandBuilder()
  .setName('hangman')
  .setDescription('Play Hangman with Roka!')
  .addSubcommand((sub) => sub.setName('start').setDescription('Start a new game'))
  .addSubcommand((sub) =>
    sub
      .setName('guess')
      .setDescription('Guess a letter or the full word')
      .addStringOption((opt) =>
        opt.setName('letter_or_word').setDescription('A single letter or the full word').setRequired(true)
      )
  )
  .addSubcommand((sub) => sub.setName('guide').setDescription('Learn how to play Hangman'))
  .addSubcommand((sub) => sub.setName('leaderboard').setDescription('View the Hangman hall of fame'))

export const shiritoriCommand = new SlashCommandBuilder()
  .setName('shiritori')
  .setDescription('Play Shiritori (word chain) with Roka!')
  .addSubcommand((sub) => sub.setName('start').setDescription('Start a new game'))
  .addSubcommand((sub) => sub.setName('join').setDescription('Join the current game'))
  .addSubcommand((sub) =>
    sub
      .setName('play')
      .setDescription('Submit a word')
      .addStringOption((opt) => opt.setName('word').setDescription('Your word').setRequired(true))
  )
  .addSubcommand((sub) => sub.setName('end').setDescription('End the current game'))
  .addSubcommand((sub) => sub.setName('scores').setDescription('View current scores'))
  .addSubcommand((sub) => sub.setName('guide').setDescription('Learn how to play Shiritori'))
  .addSubcommand((sub) => sub.setName('leaderboard').setDescription('View the Shiritori hall of fame'))

export const gameCommands = [gachaCommand, hangmanCommand, shiritoriCommand]
