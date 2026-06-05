.PHONY: build server dev clean

build:
	cd .. && node ../../node_modules/vite/bin/vite.js build

server:
	go build -o pi-webui-server .

dev:
	cd .. && node ../../node_modules/vite/bin/vite.js

clean:
	rm -f pi-webui-server
	cd .. && rm -rf dist