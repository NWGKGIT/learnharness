FROM golang:1.27-bookworm
RUN GOCACHE=/opt/go-cache go build std
