import { ChannelType } from 'discord.js';

export function findChannel(guild, name, type) {
  return guild.channels.cache.find(
    (c) => c.name.includes(name) && (type === undefined || c.type === type),
  );
}

export function findCategory(guild, name) {
  return findChannel(guild, name, ChannelType.GuildCategory);
}

export function findRole(guild, name) {
  return guild.roles.cache.find((r) => r.name === name);
}
