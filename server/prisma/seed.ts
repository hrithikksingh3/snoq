import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
const categories=['AI Tools','Developer Tools','Automation','Content Creation','Career Growth','Documentation'];
async function main(){await Promise.all(categories.map(name=>prisma.category.upsert({where:{name},update:{},create:{name}})));console.log('Seeded resource categories only; no user data was created.');}
main().finally(()=>prisma.$disconnect());
