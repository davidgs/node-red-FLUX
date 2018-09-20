#! /bin/sh
echo ""
echo "Installing Modules and restarting Node Red ... "
echo ""
INDIR=`pwd`
NODEDIR=~/.node-red/
MODS=(${INDIR}/filter ${INDIR}/from ${INDIR}/range)
cd $NODEDIR
for t in ${MODS[@]}; do
  npm install $t
done
kill `ps -elf | grep -v grep | grep node-red | awk '{print $2}'`
node-red&
cd $INDIR
echo "done!"
